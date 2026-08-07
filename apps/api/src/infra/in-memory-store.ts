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
  Transaction,
} from '../domain/types';
import { isWithin } from '../domain/dates';
import type {
  AccountStore,
  BudgetStore,
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
}

export class InMemoryTransactionStore implements TransactionStore {
  private readonly byUser = new Map<string, Transaction[]>();

  async list(userId: string, query: TransactionQuery = {}): Promise<Transaction[]> {
    let rows = [...bucket(this.byUser, userId)];

    if (query.accountId) rows = rows.filter((t) => t.accountId === query.accountId);
    if (query.categorySlug) rows = rows.filter((t) => t.categorySlug === query.categorySlug);
    if (query.range) {
      const range = query.range;
      rows = rows.filter((t) => isWithin(t.postedAt, range));
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter(
        (t) =>
          t.normalizedDescriptor.includes(needle) ||
          t.rawDescriptor.toLowerCase().includes(needle) ||
          (t.merchant?.toLowerCase().includes(needle) ?? false),
      );
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
              categorySlug: existing.categorySlug,
              categorySource: existing.categorySource,
              categoryConfidence: existing.categoryConfidence,
            }
          : { ...txn, id: existing.id };
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
}

export class InMemoryRuleStore implements RuleStore {
  private readonly byUser = new Map<string, CategorizationRule[]>();

  async list(userId: string): Promise<CategorizationRule[]> {
    return [...bucket(this.byUser, userId)];
  }

  async create(userId: string, rule: CategorizationRule): Promise<CategorizationRule> {
    bucket(this.byUser, userId).push(rule);
    return rule;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const rows = bucket(this.byUser, userId);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }
}
