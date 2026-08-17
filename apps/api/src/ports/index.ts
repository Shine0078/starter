/**
 * Ports: the interfaces the domain needs the outside world to satisfy.
 *
 * The domain declares these; `infra/` implements them. Today the only
 * implementations are in-memory and mock. Postgres and Plaid slot in behind the
 * same interfaces without the domain or the modules changing. See ADR-0002.
 *
 * The string tokens exist because TypeScript interfaces have no runtime
 * representation, so Nest cannot inject them by type.
 */

import type {
  Account,
  Budget,
  CategorizationRule,
  DateRange,
  GoalContribution,
  NotificationPreferences,
  NetWorthSnapshot,
  RawTransaction,
  SavingsGoal,
  UserNotification,
  Transaction,
} from '../domain/types';
import type {
  SplitExpense,
  SplitGroup,
  SplitGroupMember,
  SplitSettlement,
} from '../domain/split/types';
import type { Reconciliation } from '../domain/reconciliation/types';
import type { SavedView } from '../domain/transactions/saved-view';
import type { ScheduledTransaction } from '../domain/scheduled/schedule';

export const ACCOUNT_STORE = 'ACCOUNT_STORE';
export const TRANSACTION_STORE = 'TRANSACTION_STORE';
export const BUDGET_STORE = 'BUDGET_STORE';
export const RULE_STORE = 'RULE_STORE';
export const GOAL_STORE = 'GOAL_STORE';
export const NOTIFICATION_STORE = 'NOTIFICATION_STORE';
export const SPLIT_STORE = 'SPLIT_STORE';
export const RECONCILIATION_STORE = 'RECONCILIATION_STORE';
export const SAVED_VIEW_STORE = 'SAVED_VIEW_STORE';
export const IMPORT_BATCH_STORE = 'IMPORT_BATCH_STORE';
export const SCHEDULE_STORE = 'SCHEDULE_STORE';
export const RULE_APPLICATION_STORE = 'RULE_APPLICATION_STORE';
export const AGGREGATOR = 'AGGREGATOR';
export const CLOCK = 'CLOCK';

export interface AccountStore {
  list(userId: string): Promise<Account[]>;
  get(userId: string, accountId: string): Promise<Account | null>;
  upsertMany(userId: string, accounts: readonly Account[]): Promise<void>;
  remove(userId: string, accountId: string): Promise<boolean>;
  recordNetWorthSnapshot(userId: string, recordedOn: string): Promise<NetWorthSnapshot[]>;
  listNetWorthHistory(userId: string, limit?: number): Promise<NetWorthSnapshot[]>;
}

export interface TransactionQuery {
  accountId?: string;
  categorySlug?: string;
  /** Filter by the seeded category kind, e.g. income, expense, or transfer. */
  categoryKind?: 'expense' | 'income' | 'transfer' | 'special';
  range?: DateRange;
  /** Case-insensitive substring over the normalized descriptor. */
  search?: string;
  /** Pending or settled rows only. */
  pending?: boolean;
  /** Recurring series only, or one-off rows only. */
  recurring?: boolean;
  /** Inclusive absolute amount bounds in minor units. */
  amountMin?: number;
  amountMax?: number;
  /** Exact user-owned label, case-insensitive after normalization. */
  tag?: string;
  /** Stable keyset cursor: return rows strictly older than this transaction. */
  before?: { postedAt: string; id: string };
  limit?: number;
}

export interface TransactionStore {
  list(userId: string, query?: TransactionQuery): Promise<Transaction[]>;
  get(userId: string, id: string): Promise<Transaction | null>;
  /**
   * Idempotent by `(accountId, providerTxnId)`. Aggregators re-send
   * transactions freely; without this guarantee every sync duplicates history
   * and every number in the app becomes wrong.
   *
   * Returns counts so sync can report what actually changed.
   */
  upsertMany(
    userId: string,
    transactions: readonly Transaction[],
  ): Promise<{ inserted: number; updated: number }>;
  update(userId: string, id: string, patch: Partial<Transaction>): Promise<Transaction | null>;
  removeByProviderIds(userId: string, providerTxnIds: readonly string[]): Promise<number>;
  /**
   * Removes every row carrying this import batch id, returning the count.
   *
   * Scoped to the batch rather than to a date range or an account, so undoing
   * an import cannot take a provider-synced transaction with it.
   */
  removeByImportBatch(userId: string, importBatchId: string): Promise<number>;
}

export interface BudgetStore {
  list(userId: string): Promise<Budget[]>;
  get(userId: string, id: string): Promise<Budget | null>;
  create(userId: string, budget: Budget): Promise<Budget>;
  remove(userId: string, id: string): Promise<boolean>;
}

export interface GoalStore {
  list(userId: string): Promise<SavingsGoal[]>;
  get(userId: string, id: string): Promise<SavingsGoal | null>;
  create(userId: string, goal: SavingsGoal): Promise<SavingsGoal>;
  remove(userId: string, id: string): Promise<boolean>;
  listContributions(userId: string, goalId: string): Promise<GoalContribution[]>;
  addContribution(userId: string, contribution: GoalContribution): Promise<GoalContribution>;
}

export interface NotificationStore {
  list(userId: string): Promise<UserNotification[]>;
  upsert(userId: string, notification: UserNotification): Promise<boolean>;
  markRead(userId: string, id: string, at: string): Promise<boolean>;
  getPreferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences>;
}

/**
 * Shared expenses between FINVERSE users. Unlike every other store, the
 * visibility boundary is group membership, not a `user_id` column — each
 * method's `userId` is the acting member, and row-level security does the
 * enforcement on Postgres.
 */
export interface SplitStore {
  listGroups(userId: string): Promise<SplitGroup[]>;
  getGroup(userId: string, groupId: string): Promise<SplitGroup | null>;
  createGroup(
    userId: string,
    group: SplitGroup,
    membership: SplitGroupMember,
  ): Promise<SplitGroup>;
  archiveGroup(userId: string, groupId: string): Promise<boolean>;
  listMembers(userId: string, groupId: string): Promise<SplitGroupMember[]>;
  addMember(userId: string, membership: SplitGroupMember): Promise<SplitGroupMember>;
  listExpenses(userId: string, groupId: string): Promise<SplitExpense[]>;
  addExpense(userId: string, expense: SplitExpense): Promise<SplitExpense>;
  listSettlements(userId: string, groupId: string): Promise<SplitSettlement[]>;
  addSettlement(userId: string, settlement: SplitSettlement): Promise<SplitSettlement>;
}

/**
 * Balance assertions. Append-and-archive only: there is deliberately no
 * `update`, because editing an observation after the fact would make the audit
 * trail say something the user never claimed.
 */
export interface ReconciliationStore {
  list(userId: string, accountId?: string): Promise<Reconciliation[]>;
  get(userId: string, id: string): Promise<Reconciliation | null>;
  /**
   * Replaces any live assertion for the same account and statement date — a
   * second observation of one closing date is a correction, not a second fact.
   */
  create(userId: string, reconciliation: Reconciliation): Promise<Reconciliation>;
  archive(userId: string, id: string, at: string): Promise<boolean>;
}

/** Named transaction filters. Names are unique per user, case-insensitively. */
export interface SavedViewStore {
  list(userId: string): Promise<SavedView[]>;
  get(userId: string, id: string): Promise<SavedView | null>;
  /** Rejects a duplicate name; the unique index is the arbiter, not a prior read. */
  create(userId: string, view: SavedView): Promise<SavedView>;
  remove(userId: string, id: string): Promise<boolean>;
}

export class DuplicateViewNameError extends Error {
  constructor(name: string) {
    super(`A view called "${name}" already exists.`);
    this.name = 'DuplicateViewNameError';
  }
}

export interface ImportBatch {
  id: string;
  accountId: string;
  filename: string;
  status: 'committed' | 'reverted';
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicate: number;
  rowsInvalid: number;
  createdAt: string;
  revertedAt: string | null;
}

/**
 * Manual imports, and the undo behind them.
 *
 * `revert` is the reason this store exists: it removes only the transactions
 * carrying this batch id, so it can never touch a row that came from a provider
 * sync. The batch row survives, marked reverted, because the history of what
 * was imported and undone is itself worth keeping.
 */
export interface ImportBatchStore {
  list(userId: string): Promise<ImportBatch[]>;
  get(userId: string, id: string): Promise<ImportBatch | null>;
  /** Records the batch and inserts its transactions in one transaction. */
  commit(
    userId: string,
    batch: ImportBatch,
    transactions: readonly Transaction[],
  ): Promise<ImportBatch>;
  /** Returns how many transactions were removed, or null when already reverted. */
  revert(userId: string, id: string, at: string): Promise<number | null>;
}

/** Declared obligations. Archived rather than deleted, so history survives. */
export interface ScheduleStore {
  list(userId: string, includeArchived?: boolean): Promise<ScheduledTransaction[]>;
  get(userId: string, id: string): Promise<ScheduledTransaction | null>;
  create(userId: string, schedule: ScheduledTransaction): Promise<ScheduledTransaction>;
  update(
    userId: string,
    id: string,
    patch: Partial<ScheduledTransaction>,
  ): Promise<ScheduledTransaction | null>;
  archive(userId: string, id: string, at: string): Promise<boolean>;
}

export interface RuleApplicationChange {
  transactionId: string;
  previousCategorySlug: string;
  previousCategorySource: Transaction['categorySource'];
  previousConfidence: number;
}

export interface RuleApplication {
  id: string;
  pattern: string;
  matchType: CategorizationRule['matchType'];
  categorySlug: string;
  rowsChanged: number;
  createdAt: string;
  revertedAt: string | null;
}

/**
 * Bulk recategorizations and their undo.
 *
 * The prior category of every changed row is stored, because a revert needs to
 * know what each row was *before* — that is not recoverable from the rule.
 */
export interface RuleApplicationStore {
  list(userId: string): Promise<RuleApplication[]>;
  /** Applies the changes and records the before-state in one transaction. */
  apply(
    userId: string,
    application: RuleApplication,
    changes: readonly RuleApplicationChange[],
  ): Promise<RuleApplication>;
  /** Restores prior categories. Null when unknown or already reverted. */
  revert(userId: string, id: string, at: string): Promise<number | null>;
}

export interface RuleStore {
  list(userId: string): Promise<CategorizationRule[]>;
  create(userId: string, rule: CategorizationRule): Promise<CategorizationRule>;
  remove(userId: string, id: string): Promise<boolean>;
}

/**
 * One aggregator. Plaid, Flinks, TrueLayer, and Tink each get an adapter;
 * coverage is regional so we will run more than one simultaneously.
 */
export interface AggregatorPort {
  readonly name: string;
  listAccounts(linkId: string): Promise<Account[]>;
  /**
   * Cursor-based delta sync. `cursor` is opaque and provider-specific; pass
   * back what the previous call returned. Undefined means "from the beginning".
   */
  fetchTransactions(
    linkId: string,
    cursor?: string,
  ): Promise<{ transactions: RawTransaction[]; nextCursor: string; hasMore: boolean }>;
}

/** Injected so time-dependent logic is deterministic under test. */
export interface ClockPort {
  /** `YYYY-MM-DD`, UTC. */
  today(): string;
  now(): Date;
}
