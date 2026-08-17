import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { displayName } from '../../domain/categories';
import { monthToDateRange } from '../../domain/dates';
import { summarizePeriod, type PeriodSummary } from '../../domain/insights/insights';
import { formatMoney, money } from '../../domain/money';
import { toTransactionQuery, type SavedView } from '../../domain/transactions/saved-view';
import type { Transaction } from '../../domain/types';
import {
  CLOCK,
  SAVED_VIEW_STORE,
  TRANSACTION_STORE,
  type ClockPort,
  type SavedViewStore,
  type TransactionStore,
} from '../../ports';

export interface ChartPoint {
  label: string;
  /** Positive minor units. */
  value: number;
  /** Share of the total, 0–100. */
  percent: number;
}

export interface ViewReport {
  view: SavedView;
  period: { start: string; end: string };
  summary: PeriodSummary;
  /** Chart-ready series. */
  byCategory: ChartPoint[];
  /**
   * The same numbers as rows.
   *
   * Fava's lesson: every chart needs a path back to the figures behind it. A
   * pie chart is unreadable to a screen reader and unusable to anyone who wants
   * to check a total, so the table is part of the response rather than
   * something the client has to reconstruct.
   */
  table: Array<{ category: string; amount: string; percent: string; transactions: number }>;
  /** One sentence a screen reader can announce instead of the chart. */
  spokenSummary: string;
  transactionCount: number;
}

@Injectable()
export class ViewReportService {
  constructor(
    @Inject(SAVED_VIEW_STORE) private readonly views: SavedViewStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * A report over a saved view.
   *
   * Reuses the same query path as the transaction list and the same
   * `summarizePeriod` as every other total in the product. A report that
   * recomputed its own figures would eventually disagree with the dashboard,
   * and the user would have no way to tell which was right.
   */
  async byView(userId: string, viewId: string, currency = 'USD'): Promise<ViewReport> {
    const view = await this.views.get(userId, viewId);
    // Scoped by userId, so another user's view id looks exactly like a
    // nonexistent one.
    if (!view) throw new NotFoundException('No such view.');

    const transactions = await this.transactions.list(
      userId,
      toTransactionQuery(view.filter),
    );

    // The filter may carry its own dates. When it does not, the report covers
    // month-to-date rather than all history, which is what a dashboard means
    // by "now" everywhere else in the product.
    const period =
      view.filter.dateFrom || view.filter.dateTo
        ? {
            start: view.filter.dateFrom ?? '0001-01-01',
            end: view.filter.dateTo ?? '9999-12-31',
          }
        : monthToDateRange(this.clock.today());

    const summary = summarizePeriod(transactions, period, currency);
    const byCategory = this.toChart(summary, currency);

    return {
      view,
      period,
      summary,
      byCategory,
      table: byCategory.map((point) => {
        const category = summary.topCategories.find(
          (c) => c.categoryName === point.label,
        );
        return {
          category: point.label,
          amount: formatMoney(money(point.value, currency)),
          percent: `${point.percent.toFixed(1)}%`,
          transactions: category?.transactionCount ?? 0,
        };
      }),
      spokenSummary: this.speak(view, summary, byCategory, currency),
      transactionCount: transactions.length,
    };
  }

  private toChart(summary: PeriodSummary, currency: string): ChartPoint[] {
    void currency;
    const total = summary.expenses;

    return summary.topCategories.map((category) => ({
      label: category.categoryName,
      value: category.total,
      // Guarded: a report over a period with no spending would otherwise
      // produce NaN in every row.
      percent: total === 0 ? 0 : (category.total / total) * 100,
    }));
  }

  private speak(
    view: SavedView,
    summary: PeriodSummary,
    points: readonly ChartPoint[],
    currency: string,
  ): string {
    if (summary.transactionCount === 0) {
      return `${view.name}: no transactions matched in this period.`;
    }

    const spent = formatMoney(money(summary.expenses, currency));
    const top = points[0];

    if (!top) {
      return `${view.name}: ${summary.transactionCount} transactions, ${spent} spent.`;
    }

    return (
      `${view.name}: ${spent} across ${summary.transactionCount} transactions. ` +
      `Largest category ${top.label} at ${formatMoney(money(top.value, currency))}, ` +
      `${top.percent.toFixed(0)} percent of the total.`
    );
  }

  /** Category totals for an ad-hoc set, used by the export path. */
  static categoryBreakdown(transactions: readonly Transaction[]): Map<string, number> {
    const totals = new Map<string, number>();

    for (const txn of transactions) {
      const outflow = Math.max(0, -txn.amount);
      if (outflow === 0) continue;
      const name = displayName(txn.categorySlug);
      totals.set(name, (totals.get(name) ?? 0) + outflow);
    }

    return totals;
  }
}
