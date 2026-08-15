/**
 * In-memory implementations of the store ports.
 *
 * These are not a toy: they are the reference implementation that defines the
 * contract Postgres must satisfy, and they are what lets the vertical slice run
 * and be tested without a database (ADR-0002).
 *
 * Data is per-user-keyed exactly as the Postgres adapter will be, so a missing
 * user scope shows up here rather than in production.
 */

import type {
  Account,
  Budget,
  CategorizationRule,
  GoalContribution,
  NotificationPreferences,
  NetWorthSnapshot,
  SavingsGoal,
  UserNotification,
  Transaction,
} from '../domain/types';
import { isWithin } from '../domain/dates';
import { getCategory } from '../domain/categories';
import type {
  AccountStore,
  BudgetStore,
  GoalStore,
  NotificationStore,
  RuleStore,
  TransactionQuery,
  TransactionStore,
} from '../ports';

function bucket<T>(map: Map<string, T[]>, userId: string): T[] {
  const existing = map.get(userId);
  if (existing) return existing;
  const fresh: T[] = [];
  map.set(userId, fresh);
  return fresh;
}

export class InMemoryAccountStore implements AccountStore {
  private readonly byUser = new Map<string, Account[]>();
  private readonly snapshotsByUser = new Map<string, NetWorthSnapshot[]>();

  async list(userId: string): Promise<Account[]> {
    return [...bucket(this.byUser, userId)];
  }

  async get(userId: string, accountId: string): Promise<Account | null> {
    return bucket(this.byUser, userId).find((a) => a.id === accountId) ?? null;
  }

  async upsertMany(userId: string, accounts: readonly Account[]): Promise<void> {
    const rows = bucket(this.byUser, userId);
    for (const account of accounts) {
      const index = rows.findIndex((a) => a.id === account.id);
      if (index >= 0) rows[index] = account;
      else rows.push(account);
    }
  }

  async remove(userId: string, accountId: string): Promise<boolean> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((account) => account.id === accountId);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }

  async recordNetWorthSnapshot(
    userId: string,
    recordedOn: string,
  ): Promise<NetWorthSnapshot[]> {
    const totals = netWorthByCurrency(bucket(this.byUser, userId), recordedOn);
    const history = bucket(this.snapshotsByUser, userId);
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const row = history[index];
      if (row?.recordedOn === recordedOn) history.splice(index, 1);
    }
    history.push(...totals);
    history.sort(
      (a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.currency.localeCompare(b.currency),
    );
    return totals;
  }

  async listNetWorthHistory(userId: string, limit = 365): Promise<NetWorthSnapshot[]> {
    const history = [...bucket(this.snapshotsByUser, userId)];
    return history.slice(Math.max(0, history.length - limit));
  }

  purgeUser(userId: string): void {
    this.byUser.delete(userId);
    this.snapshotsByUser.delete(userId);
  }
}

function netWorthByCurrency(
  accounts: readonly Account[],
  recordedOn: string,
): NetWorthSnapshot[] {
  const totals = new Map<string, { assets: number; debts: number }>();
  for (const account of accounts) {
    const currency = account.currency.toUpperCase();
    const current = totals.get(currency) ?? { assets: 0, debts: 0 };
    if (account.balanceCurrent >= 0) current.assets += account.balanceCurrent;
    else current.debts += Math.abs(account.balanceCurrent);
    totals.set(currency, current);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => ({
      recordedOn,
      currency,
      assets: total.assets,
      debts: total.debts,
      netPosition: total.assets - total.debts,
    }));
}

export class InMemoryTransactionStore implements TransactionStore {
  private readonly byUser = new Map<string, Transaction[]>();

  async list(userId: string, query: TransactionQuery = {}): Promise<Transaction[]> {
    let rows = [...bucket(this.byUser, userId)];

    if (query.accountId) rows = rows.filter((t) => t.accountId === query.accountId);
    if (query.categorySlug) rows = rows.filter((t) => t.categorySlug === query.categorySlug);
    if (query.categoryKind) {
      rows = rows.filter((t) => getCategory(t.categorySlug)?.kind === query.categoryKind);
    }
    if (query.range) {
      const range = query.range;
      rows = rows.filter((t) => isWithin(t.postedAt, range));
    }
    if (query.before) {
      const { postedAt, id } = query.before;
      rows = rows.filter(
        (t) => t.postedAt < postedAt || (t.postedAt === postedAt && t.id < id),
      );
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter(
        (t) =>
          t.normalizedDescriptor.includes(needle) ||
          t.rawDescriptor.toLowerCase().includes(needle) ||
          (t.merchant?.toLowerCase().includes(needle) ?? false) ||
          (t.merchantOverride?.toLowerCase().includes(needle) ?? false) ||
          (t.note?.toLowerCase().includes(needle) ?? false),
      );
    }
    if (query.pending !== undefined) rows = rows.filter((t) => t.pending === query.pending);
    if (query.recurring !== undefined) {
      rows = rows.filter((t) => t.isRecurring === query.recurring);
    }
    if (query.amountMin !== undefined) {
      rows = rows.filter((t) => Math.abs(t.amount) >= query.amountMin!);
    }
    if (query.amountMax !== undefined) {
      rows = rows.filter((t) => Math.abs(t.amount) <= query.amountMax!);
    }

    rows.sort((a, b) => b.postedAt.localeCompare(a.postedAt) || b.id.localeCompare(a.id));
    return query.limit ? rows.slice(0, query.limit) : rows;
  }

  async get(userId: string, id: string): Promise<Transaction | null> {
    return bucket(this.byUser, userId).find((t) => t.id === id) ?? null;
  }

  /** Idempotent on (accountId, providerTxnId) — mirrors the unique index. */
  async upsertMany(
    userId: string,
    transactions: readonly Transaction[],
  ): Promise<{ inserted: number; updated: number }> {
    const rows = bucket(this.byUser, userId);
    let inserted = 0;
    let updated = 0;

    for (const txn of transactions) {
      const index = rows.findIndex(
        (t) => t.accountId === txn.accountId && t.providerTxnId === txn.providerTxnId,
      );
      if (index >= 0) {
        // Preserve a manual category across re-sync. The aggregator resending a
        // transaction must never silently undo a user's correction.
        const existing = rows[index]!;
        const keepsUserCategory =
          existing.categorySource === 'user_manual' || existing.categorySource === 'user_rule';
        rows[index] = keepsUserCategory
          ? {
              ...txn,
              id: existing.id,
              merchantOverride: existing.merchantOverride,
              note: existing.note,
              excludedFromAnalytics: existing.excludedFromAnalytics,
              categorySlug: existing.categorySlug,
              categorySource: existing.categorySource,
              categoryConfidence: existing.categoryConfidence,
              recurringOverride: existing.recurringOverride,
              duplicateReported: existing.duplicateReported,
              isRecurring: existing.recurringOverride ?? txn.isRecurring,
            }
          : {
              ...txn,
              id: existing.id,
              recurringOverride: existing.recurringOverride,
              duplicateReported: existing.duplicateReported,
              isRecurring: existing.recurringOverride ?? txn.isRecurring,
            };
        updated += 1;
      } else {
        rows.push(txn);
        inserted += 1;
      }
    }

    return { inserted, updated };
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Transaction>,
  ): Promise<Transaction | null> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const next = { ...rows[index]!, ...patch, id };
    rows[index] = next;
    return next;
  }

  async removeByProviderIds(userId: string, providerTxnIds: readonly string[]): Promise<number> {
    if (providerTxnIds.length === 0) return 0;
    const ids = new Set(providerTxnIds);
    const rows = bucket(this.byUser, userId);
    let removed = 0;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (!ids.has(rows[index]!.providerTxnId)) continue;
      rows.splice(index, 1);
      removed += 1;
    }
    return removed;
  }

  purgeUser(userId: string): void {
    this.byUser.delete(userId);
  }
}

export class InMemoryBudgetStore implements BudgetStore {
  private readonly byUser = new Map<string, Budget[]>();

  async list(userId: string): Promise<Budget[]> {
    return [...bucket(this.byUser, userId)];
  }

  async get(userId: string, id: string): Promise<Budget | null> {
    return bucket(this.byUser, userId).find((b) => b.id === id) ?? null;
  }

  async create(userId: string, budget: Budget): Promise<Budget> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((b) => b.id === budget.id);
    if (index >= 0) rows[index] = budget;
    else rows.push(budget);
    return budget;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((b) => b.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }

  purgeUser(userId: string): void {
    this.byUser.delete(userId);
  }
}

export class InMemoryGoalStore implements GoalStore {
  private readonly goals = new Map<string, SavingsGoal[]>();
  private readonly contributions = new Map<string, GoalContribution[]>();

  async list(userId: string): Promise<SavingsGoal[]> {
    return [...bucket(this.goals, userId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(userId: string, id: string): Promise<SavingsGoal | null> {
    return bucket(this.goals, userId).find((goal) => goal.id === id) ?? null;
  }

  async create(userId: string, goal: SavingsGoal): Promise<SavingsGoal> {
    const rows = bucket(this.goals, userId);
    const index = rows.findIndex((candidate) => candidate.id === goal.id);
    if (index >= 0) rows[index] = goal;
    else rows.push(goal);
    return goal;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = bucket(this.goals, userId);
    const index = rows.findIndex((goal) => goal.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    const contributionRows = bucket(this.contributions, userId);
    for (let i = contributionRows.length - 1; i >= 0; i -= 1) {
      if (contributionRows[i]?.goalId === id) contributionRows.splice(i, 1);
    }
    return true;
  }

  async listContributions(userId: string, goalId: string): Promise<GoalContribution[]> {
    return bucket(this.contributions, userId)
      .filter((row) => row.goalId === goalId)
      .sort((a, b) => a.contributedAt.localeCompare(b.contributedAt) || a.id.localeCompare(b.id));
  }

  async addContribution(
    userId: string,
    contribution: GoalContribution,
  ): Promise<GoalContribution> {
    if (!(await this.get(userId, contribution.goalId))) throw new Error('Goal does not exist.');
    bucket(this.contributions, userId).push(contribution);
    return contribution;
  }

  purgeUser(userId: string): void {
    this.goals.delete(userId);
    this.contributions.delete(userId);
  }
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  budget: true,
  bills: true,
  creditUtilization: true,
  subscriptions: true,
  lowBalance: true,
  unusualTransactions: true,
  bankSync: true,
  security: true,
};

export class InMemoryNotificationStore implements NotificationStore {
  private readonly rows = new Map<string, UserNotification[]>();
  private readonly preferences = new Map<string, NotificationPreferences>();

  async list(userId: string): Promise<UserNotification[]> {
    return [...bucket(this.rows, userId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsert(userId: string, notification: UserNotification): Promise<boolean> {
    const rows = bucket(this.rows, userId);
    if (rows.some((row) => row.dedupeKey === notification.dedupeKey)) return false;
    rows.push(notification);
    return true;
  }

  async markRead(userId: string, id: string, at: string): Promise<boolean> {
    const row = bucket(this.rows, userId).find((candidate) => candidate.id === id);
    if (!row) return false;
    row.readAt ??= at;
    return true;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return { ...(this.preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES) };
  }

  async updatePreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    this.preferences.set(userId, { ...preferences });
    return { ...preferences };
  }

  purgeUser(userId: string): void {
    this.rows.delete(userId);
    this.preferences.delete(userId);
  }
}

export class InMemoryRuleStore implements RuleStore {
  private readonly byUser = new Map<string, CategorizationRule[]>();

  /** Priority order, ties broken by id — the same ordering the Postgres
   *  adapter's index gives. Returning insertion order here would make rule
   *  precedence depend on which store happened to be running. */
  async list(userId: string): Promise<CategorizationRule[]> {
    return [...bucket(this.byUser, userId)].sort(
      (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
    );
  }

  async create(userId: string, rule: CategorizationRule): Promise<CategorizationRule> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((r) => r.id === rule.id);
    if (index >= 0) rows[index] = rule;
    else rows.push(rule);
    return rule;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }

  purgeUser(userId: string): void {
    this.byUser.delete(userId);
  }
}
