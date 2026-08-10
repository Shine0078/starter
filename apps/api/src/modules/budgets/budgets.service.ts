import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { isSpendingCategory, isKnownCategory, UNKNOWN_CATEGORY } from '../../domain/categories';
import { monthRange, weekRange, yearRange } from '../../domain/dates';
import {
  budgetAlerts,
  computeBudgetProgress,
  type BudgetAlert,
  type BudgetProgress,
} from '../../domain/budgets/progress';
import type { Budget, BudgetPeriodType, DateRange } from '../../domain/types';
import {
  BUDGET_STORE,
  CLOCK,
  TRANSACTION_STORE,
  type BudgetStore,
  type ClockPort,
  type TransactionStore,
} from '../../ports';

export interface CreateBudgetInput {
  categorySlug: string;
  /** Minor units, positive. */
  limitAmount: number;
  period?: BudgetPeriodType;
  currency?: string;
  rollover?: boolean;
}

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(BUDGET_STORE) private readonly budgets: BudgetStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  list(userId: string): Promise<Budget[]> {
    return this.budgets.list(userId);
  }

  async create(userId: string, input: CreateBudgetInput): Promise<Budget> {
    if (!isKnownCategory(input.categorySlug)) {
      throw new BadRequestException(`Unknown category "${input.categorySlug}"`);
    }
    // Budgeting a transfer or income category would produce a budget that can
    // never be met, because those are excluded from spend by design.
    if (!isSpendingCategory(input.categorySlug)) {
      throw new BadRequestException(
        `"${input.categorySlug}" is not a spending category, so it cannot be budgeted.`,
      );
    }
    // `unknown` is a spending category (uncategorized money still left the
    // account) but budgeting it makes no sense — it is a review queue, not a
    // thing the user chooses to spend on.
    if (input.categorySlug === UNKNOWN_CATEGORY) {
      throw new BadRequestException('Uncategorized transactions cannot be budgeted.');
    }
    if (!Number.isInteger(input.limitAmount) || input.limitAmount <= 0) {
      throw new BadRequestException('limitAmount must be a positive integer in minor units.');
    }

    const budget: Budget = {
      // Derived from the category, not from a timestamp. One budget per
      // category is the domain rule — two budgets on Restaurants would each
      // report a different "remaining" and neither would be right. A
      // deterministic id makes re-creating one an edit in both the in-memory
      // and Postgres adapters, rather than a duplicate in one and a unique
      // -constraint violation in the other.
      id: `bud_${input.categorySlug}`,
      categorySlug: input.categorySlug,
      limitAmount: input.limitAmount,
      currency: (input.currency ?? 'USD').toUpperCase(),
      period: input.period ?? 'monthly',
      rollover: input.rollover ?? false,
    };

    return this.budgets.create(userId, budget);
  }

  remove(userId: string, id: string): Promise<boolean> {
    return this.budgets.remove(userId, id);
  }

  private rangeFor(period: BudgetPeriodType, today: string): DateRange {
    switch (period) {
      case 'weekly':
        return weekRange(today);
      case 'yearly':
        return yearRange(today);
      case 'monthly':
      default:
        return monthRange(today);
    }
  }

  async progress(
    userId: string,
    asOf?: string,
  ): Promise<Array<BudgetProgress & { alerts: BudgetAlert[]; period: DateRange }>> {
    const today = asOf ?? this.clock.today();
    const budgets = await this.budgets.list(userId);
    const transactions = await this.transactions.list(userId);

    return budgets.map((budget) => {
      const period = this.rangeFor(budget.period, today);
      const progress = computeBudgetProgress(budget, transactions, period, today);
      return { ...progress, period, alerts: budgetAlerts(progress) };
    });
  }

  /** Share of budgets currently within their limit. Null when there are none —
   *  feeds the health score, which treats "no budgets" as neutral, not bad. */
  async adherenceRatio(
    userId: string,
    asOf?: string,
    currency?: string,
  ): Promise<number | null> {
    const rows = await this.progress(userId, asOf);
    const scopedRows = currency
      ? rows.filter((row) => row.currency === currency)
      : rows;
    if (scopedRows.length === 0) return null;
    return scopedRows.filter((r) => r.status !== 'exceeded').length / scopedRows.length;
  }
}
