import { describe, expect, it } from 'vitest';

import { normalizeTransactionTags } from '../src/domain/transactions/tags';
import type { Transaction } from '../src/domain/types';
import { InMemoryTransactionStore } from '../src/infra/in-memory-store';

const transaction = (id: string, tags: string[] = []): Transaction => ({
  id,
  accountId: 'account-1',
  providerTxnId: id,
  postedAt: '2026-08-01',
  amount: -1_250,
  currency: 'USD',
  rawDescriptor: 'COFFEE SHOP',
  normalizedDescriptor: 'coffee shop',
  categorySlug: 'coffee',
  categorySource: 'lexicon',
  categoryConfidence: 0.9,
  isRecurring: false,
  pending: false,
  tags,
});

describe('transaction tags', () => {
  it('normalizes, deduplicates, and sorts labels', () => {
    expect(normalizeTransactionTags([' Travel ', 'review', 'travel'])).toEqual([
      'review',
      'travel',
    ]);
  });

  it('rejects malformed labels before persistence', () => {
    expect(() => normalizeTransactionTags([''])).toThrow(/1 through 40/);
    expect(() => normalizeTransactionTags(['a'.repeat(41)])).toThrow(/1 through 40/);
    expect(() => normalizeTransactionTags(Array.from({ length: 21 }, () => 'tag')))
      .toThrow(/at most 20/);
  });

  it('filters labels without crossing the user boundary', async () => {
    const store = new InMemoryTransactionStore();
    await store.upsertMany('user-a', [transaction('tagged', ['travel', 'review'])]);
    await store.upsertMany('user-b', [transaction('other', ['travel'])]);

    expect((await store.list('user-a', { tag: 'travel' })).map((row) => row.id)).toEqual(['tagged']);
    expect(await store.list('user-a', { tag: 'missing' })).toEqual([]);
    expect((await store.list('user-b', { tag: 'travel' })).map((row) => row.id)).toEqual(['other']);
  });

  it('preserves labels when a provider re-sends a transaction', async () => {
    const store = new InMemoryTransactionStore();
    await store.upsertMany('user-a', [transaction('stable', ['reimbursable'])]);
    await store.upsertMany('user-a', [transaction('stable')]);
    expect((await store.get('user-a', 'stable'))?.tags).toEqual(['reimbursable']);
  });
});
