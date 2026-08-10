/**
 * Sync idempotency, tested against the in-memory store.
 *
 * This is the property everything else rests on: aggregators re-send
 * transactions freely, and if a re-sync duplicates rows then every balance,
 * budget, and insight in the product is wrong.
 */

import { describe, expect, it } from 'vitest';

import { categorizeDescriptor } from '../src/domain/categorization/categorize';
import { normalizeDescriptor } from '../src/domain/categorization/normalize';
import type { RawTransaction, Transaction } from '../src/domain/types';
import { InMemoryTransactionStore } from '../src/infra/in-memory-store';
import { MockAggregator } from '../src/infra/mock-aggregator';

const USER = 'user_test';

function toTransaction(raw: RawTransaction): Transaction {
  const cat = categorizeDescriptor(raw.descriptor);
  return {
    id: `txn_${raw.accountId}_${raw.providerTxnId}`,
    accountId: raw.accountId,
    providerTxnId: raw.providerTxnId,
    postedAt: raw.postedAt,
    amount: raw.amount,
    currency: raw.currency,
    rawDescriptor: raw.descriptor,
    normalizedDescriptor: normalizeDescriptor(raw.descriptor),
    merchant: cat.merchant,
    categorySlug: cat.categorySlug,
    categorySource: cat.source,
    categoryConfidence: cat.confidence,
    isRecurring: false,
    pending: raw.pending,
  };
}

describe('transaction store idempotency', () => {
  it('does not duplicate when the same batch arrives twice', async () => {
    const store = new InMemoryTransactionStore();
    const aggregator = new MockAggregator({ today: '2026-08-07' });
    const { transactions: raw } = await aggregator.fetchTransactions('link');
    const mapped = raw.map(toTransaction);

    const first = await store.upsertMany(USER, mapped);
    expect(first.inserted).toBe(mapped.length);
    expect(first.updated).toBe(0);

    const second = await store.upsertMany(USER, mapped);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(mapped.length);

    expect(await store.list(USER)).toHaveLength(mapped.length);
  });

  it('updates an amount when a pending transaction settles', async () => {
    const store = new InMemoryTransactionStore();
    const base = toTransaction({
      providerTxnId: 'p1',
      accountId: 'acc',
      postedAt: '2026-08-06',
      amount: -4_200,
      currency: 'USD',
      descriptor: 'STARBUCKS STORE 04412 SEATTLE WA',
      pending: true,
    });

    await store.upsertMany(USER, [base]);
    await store.upsertMany(USER, [{ ...base, amount: -4_650, pending: false }]);

    const rows = await store.list(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(-4_650);
    expect(rows[0]?.pending).toBe(false);
  });

  it('does not undo a user correction on re-sync', async () => {
    // The aggregator resending a transaction must never silently revert a
    // category the user set by hand. This is the trust-breaking bug.
    const store = new InMemoryTransactionStore();
    const base = toTransaction({
      providerTxnId: 'p2',
      accountId: 'acc',
      postedAt: '2026-08-05',
      amount: -2_000,
      currency: 'USD',
      descriptor: 'TARGET 00021',
      pending: false,
    });

    await store.upsertMany(USER, [base]);
    await store.update(USER, base.id, {
      categorySlug: 'groceries',
      categorySource: 'user_manual',
      categoryConfidence: 1,
    });

    await store.upsertMany(USER, [base]);

    const rows = await store.list(USER);
    expect(rows[0]?.categorySlug).toBe('groceries');
    expect(rows[0]?.categorySource).toBe('user_manual');
  });

  it('keeps users separate', async () => {
    const store = new InMemoryTransactionStore();
    const row = toTransaction({
      providerTxnId: 'p3',
      accountId: 'acc',
      postedAt: '2026-08-05',
      amount: -1_000,
      currency: 'USD',
      descriptor: 'NETFLIX.COM 1',
      pending: false,
    });

    await store.upsertMany('user_a', [row]);
    expect(await store.list('user_b')).toHaveLength(0);
  });

  it('filters by search, category, and date range', async () => {
    const store = new InMemoryTransactionStore();
    const aggregator = new MockAggregator({ today: '2026-08-07' });
    const { transactions: raw } = await aggregator.fetchTransactions('link');
    await store.upsertMany(USER, raw.map(toTransaction));

    const netflix = await store.list(USER, { search: 'netflix' });
    expect(netflix.length).toBeGreaterThan(0);
    expect(netflix.every((t) => t.normalizedDescriptor.includes('netflix'))).toBe(true);

    const coffee = await store.list(USER, { categorySlug: 'coffee' });
    expect(coffee.every((t) => t.categorySlug === 'coffee')).toBe(true);

    const july = await store.list(USER, { range: { start: '2026-07-01', end: '2026-07-31' } });
    expect(july.every((t) => t.postedAt >= '2026-07-01' && t.postedAt <= '2026-07-31')).toBe(true);

    const income = await store.list(USER, { categoryKind: 'income' });
    expect(income.length).toBeGreaterThan(0);
    expect(income.every((t) => ['income', 'salary', 'freelance', 'refunds', 'interest_income'].includes(t.categorySlug))).toBe(true);

    const pending = await store.list(USER, { pending: true });
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((t) => t.pending)).toBe(true);

    const bounded = await store.list(USER, { amountMin: 5_000, amountMax: 20_000 });
    expect(bounded.every((t) => Math.abs(t.amount) >= 5_000 && Math.abs(t.amount) <= 20_000)).toBe(true);

    const recurringTarget = raw.map(toTransaction).find((t) => t.amount < 0);
    expect(recurringTarget).toBeDefined();
    await store.upsertMany(USER, [recurringTarget!]);
    await store.update(USER, recurringTarget!.id, { isRecurring: true });
    const recurring = await store.list(USER, { recurring: true });
    expect(recurring.some((t) => t.id === recurringTarget!.id)).toBe(true);
    expect(recurring.every((t) => t.isRecurring)).toBe(true);
  });

  it('returns transactions newest first', async () => {
    const store = new InMemoryTransactionStore();
    const aggregator = new MockAggregator({ today: '2026-08-07' });
    const { transactions: raw } = await aggregator.fetchTransactions('link');
    await store.upsertMany(USER, raw.map(toTransaction));

    const rows = await store.list(USER, { limit: 10 });
    const dates = rows.map((r) => r.postedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('supports a stable keyset cursor for older transaction pages', async () => {
    const store = new InMemoryTransactionStore();
    const aggregator = new MockAggregator({ today: '2026-08-07' });
    const { transactions: raw } = await aggregator.fetchTransactions('link');
    await store.upsertMany(USER, raw.map(toTransaction));

    const first = await store.list(USER, { limit: 10 });
    const next = await store.list(USER, {
      before: { postedAt: first.at(-1)!.postedAt, id: first.at(-1)!.id },
      limit: 10,
    });

    expect(next).toHaveLength(10);
    expect(next.some((row) => first.some((older) => older.id === row.id))).toBe(false);
    expect(next[0]!.postedAt <= first.at(-1)!.postedAt).toBe(true);
  });
});

describe('MockAggregator', () => {
  it('is deterministic for a given seed', async () => {
    const a = await new MockAggregator({ today: '2026-08-07' }).fetchTransactions('l');
    const b = await new MockAggregator({ today: '2026-08-07' }).fetchTransactions('l');
    expect(a.transactions).toEqual(b.transactions);
  });

  it('never emits a transaction dated after today', async () => {
    const { transactions } = await new MockAggregator({ today: '2026-08-07' }).fetchTransactions('l');
    expect(transactions.every((t) => t.postedAt <= '2026-08-07')).toBe(true);
  });

  it('emits unique provider ids', async () => {
    const { transactions } = await new MockAggregator({ today: '2026-08-07' }).fetchTransactions('l');
    const keys = transactions.map((t) => `${t.accountId}:${t.providerTxnId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('categorizes most of what it emits', async () => {
    const { transactions } = await new MockAggregator({ today: '2026-08-07' }).fetchTransactions('l');
    const known = transactions.filter(
      (t) => categorizeDescriptor(t.descriptor).categorySlug !== 'unknown',
    );
    expect(known.length / transactions.length).toBeGreaterThan(0.85);
  });
});
