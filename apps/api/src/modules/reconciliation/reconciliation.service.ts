import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CurrencyMismatchError,
  daysSinceReconciled,
  latestPerAccount,
  reconcile,
} from '../../domain/reconciliation/balance';
import {
  RECONCILIATION_SOURCES,
  type Reconciliation,
  type ReconciliationOutcome,
  type ReconciliationSource,
} from '../../domain/reconciliation/types';
import { addDays } from '../../domain/dates';
import type { Account } from '../../domain/types';
import {
  ACCOUNT_STORE,
  CLOCK,
  RECONCILIATION_STORE,
  TRANSACTION_STORE,
  type AccountStore,
  type ClockPort,
  type ReconciliationStore,
  type TransactionStore,
} from '../../ports';

export interface CreateReconciliationInput {
  accountId: string;
  statementDate: string;
  /** Minor units, signed. */
  observedBalance: number;
  currency?: string;
  source?: ReconciliationSource;
  note?: string;
}

export interface ReconciliationView extends Reconciliation {
  accountName: string;
  status: 'balanced' | 'unbalanced';
}

export interface AccountReconciliationSummary {
  accountId: string;
  accountName: string;
  currency: string;
  currentBalance: number;
  lastStatementDate: string | null;
  lastDifference: number | null;
  daysSinceReconciled: number | null;
  /** True when nobody has checked this account in over a quarter. */
  overdue: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LENGTH = 500;

/** An account unchecked for a full quarter is where an unnoticed error settles in. */
const OVERDUE_AFTER_DAYS = 90;

/** Upper bound for "everything since". Date comparison here is string-ordered. */
const FAR_FUTURE = '9999-12-31';

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(RECONCILIATION_STORE) private readonly reconciliations: ReconciliationStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * Previews the comparison without recording anything.
   *
   * Separate from `create` on purpose: a user should be able to see the derived
   * balance before committing an assertion, and a preview that quietly wrote a
   * row would make the audit trail full of speculative entries.
   */
  async preview(
    userId: string,
    accountId: string,
    statementDate: string,
    observedBalance: number,
  ): Promise<ReconciliationOutcome & { accountName: string; currency: string }> {
    const account = await this.requireAccount(userId, accountId);
    this.assertDate(statementDate);
    this.assertAmount(observedBalance);

    const outcome = await this.compare(
      userId,
      account,
      statementDate,
      observedBalance,
      account.currency,
    );
    return { ...outcome, accountName: account.name, currency: account.currency };
  }

  async create(userId: string, input: CreateReconciliationInput): Promise<ReconciliationView> {
    const account = await this.requireAccount(userId, input.accountId);
    this.assertDate(input.statementDate);
    this.assertAmount(input.observedBalance);

    if (input.statementDate > this.clock.today()) {
      throw new BadRequestException('A statement date cannot be in the future.');
    }

    const source = input.source ?? 'statement';
    if (!RECONCILIATION_SOURCES.includes(source)) {
      throw new BadRequestException(
        `source must be one of: ${RECONCILIATION_SOURCES.join(', ')}`,
      );
    }

    const note = input.note?.trim() || null;
    if (note && note.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
    }

    const outcome = await this.compare(
      userId,
      account,
      input.statementDate,
      input.observedBalance,
      input.currency ?? account.currency,
    );

    const row: Reconciliation = {
      id: randomUUID(),
      accountId: account.id,
      statementDate: input.statementDate,
      observedBalance: input.observedBalance,
      currency: account.currency,
      computedBalance: outcome.computedBalance,
      difference: outcome.difference,
      source,
      note,
      createdAt: this.clock.now().toISOString(),
      archivedAt: null,
    };

    const saved = await this.reconciliations.create(userId, row);
    return { ...saved, accountName: account.name, status: outcome.status };
  }

  async list(userId: string, accountId?: string): Promise<ReconciliationView[]> {
    const [rows, accounts] = await Promise.all([
      this.reconciliations.list(userId, accountId),
      this.accounts.list(userId),
    ]);

    const names = new Map(accounts.map((a) => [a.id, a.name]));

    return rows.map((row) => ({
      ...row,
      // An account can be removed while its assertions remain; the history is
      // still meaningful, so it degrades to a label rather than disappearing.
      accountName: names.get(row.accountId) ?? 'Closed account',
      status: row.difference === 0 ? ('balanced' as const) : ('unbalanced' as const),
    }));
  }

  async archive(userId: string, id: string): Promise<void> {
    const archived = await this.reconciliations.archive(
      userId,
      id,
      this.clock.now().toISOString(),
    );
    if (!archived) {
      throw new NotFoundException('No such reconciliation, or it is already withdrawn.');
    }
  }

  /** Per-account state for the "what needs checking" view. */
  async summary(userId: string): Promise<AccountReconciliationSummary[]> {
    const [accounts, rows] = await Promise.all([
      this.accounts.list(userId),
      this.reconciliations.list(userId),
    ]);

    const latest = latestPerAccount(rows);
    const today = this.clock.today();

    return accounts.map((account) => {
      const last = latest.get(account.id);
      const days = daysSinceReconciled(last?.statementDate, today);

      return {
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        currentBalance: account.balanceCurrent,
        lastStatementDate: last?.statementDate ?? null,
        lastDifference: last?.difference ?? null,
        daysSinceReconciled: days,
        // Never reconciled counts as overdue: it is the case most likely to be
        // hiding something, not the one to leave quiet.
        overdue: days === null || days > OVERDUE_AFTER_DAYS,
      };
    });
  }

  // ------------------------------------------------------------- internals

  private async compare(
    userId: string,
    account: Account,
    statementDate: string,
    observedBalance: number,
    currency: string,
  ): Promise<ReconciliationOutcome> {
    // Only the rows that can affect the derivation: this account, posted strictly
    // after the statement date. Loading the full history would work and would
    // also get slower every month for no benefit.
    const transactions = await this.transactions.list(userId, {
      accountId: account.id,
      range: { start: addDays(statementDate, 1), end: FAR_FUTURE },
    });

    try {
      return reconcile(account, transactions, statementDate, observedBalance, currency);
    } catch (error) {
      // A currency mismatch is the caller's mistake, not a server fault.
      if (error instanceof CurrencyMismatchError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async requireAccount(userId: string, accountId: string): Promise<Account> {
    const account = await this.accounts.get(userId, accountId);
    // Scoped by userId, so guessing another user's account id gives the same
    // answer as guessing one that does not exist.
    if (!account) throw new NotFoundException('No such account.');
    return account;
  }

  private assertDate(value: string): void {
    if (!ISO_DATE.test(value)) {
      throw new BadRequestException('statementDate must be a calendar date (YYYY-MM-DD).');
    }
  }

  private assertAmount(value: number): void {
    if (!Number.isSafeInteger(value)) {
      throw new BadRequestException(
        'observedBalance must be a whole number of minor units, e.g. 105000 for $1,050.00.',
      );
    }
  }
}
