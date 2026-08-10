import { describe, expect, it } from 'vitest';

import { assessDataQuality } from '../src/domain/insights/data-quality';
import type { Transaction } from '../src/domain/types';

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: overrides.id ?? 'txn-1',
  accountId: overrides.accountId ?? 'acct-1',
  providerTxnId: overrides.providerTxnId ?? 'provider-1',
  postedAt: overrides.postedAt ?? '2026-08-08',
  amount: overrides.amount ?? -1_250,
  currency: overrides.currency ?? 'USD',
  rawDescriptor: overrides.rawDescriptor ?? 'COFFEE SHOP',
  normalizedDescriptor: overrides.normalizedDescriptor ?? 'coffee shop',
  merchant: overrides.merchant ?? 'Coffee Shop',
  categorySlug: overrides.categorySlug ?? 'coffee',
  categorySource: overrides.categorySource ?? 'lexicon',
  categoryConfidence: overrides.categoryConfidence ?? 0.95,
  isRecurring: overrides.isRecurring ?? false,
  pending: overrides.pending ?? false,
});

describe('assessDataQuality', () => {
  it('distinguishes a new user with no financial data', () => {
    const report = assessDataQuality({
      accounts: [],
      transactions: [],
      bankLinks: [],
      checkedAt: '2026-08-10T12:00:00.000Z',
    });

    expect(report.status).toBe('no_data');
    expect(report.score).toBe(100);
    expect(report.issues).toEqual([]);
  });

  it('flags broken references, malformed values, duplicates, and stale links', () => {
    const report = assessDataQuality({
      accounts: [{
        id: 'acct-1',
        name: 'Checking',
        type: 'checking',
        mask: '1234',
        currency: 'USD',
        balanceCurrent: 10_000,
      }],
      transactions: [
        transaction(),
        transaction({ id: 'txn-2' }),
        transaction({ id: 'txn-3', accountId: 'missing', postedAt: '2026-02-30', currency: 'US' }),
      ],
      bankLinks: [{
        status: 'healthy',
        createdAt: '2026-08-01T00:00:00.000Z',
        lastSyncedAt: '2026-08-08T00:00:00.000Z',
      }],
      checkedAt: '2026-08-10T12:00:00.000Z',
    });

    expect(report.status).toBe('attention');
    expect(report.accountCoverage).toBeCloseTo(2 / 3, 3);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing_account',
      'invalid_date',
      'invalid_currency',
      'duplicate_transaction',
      'stale_sync',
    ]));
    expect(report.score).toBeLessThan(50);
  });

  it('reports a healthy, recently synchronized account', () => {
    const report = assessDataQuality({
      accounts: [{
        id: 'acct-1',
        name: 'Checking',
        type: 'checking',
        mask: '1234',
        currency: 'USD',
        balanceCurrent: 10_000,
      }],
      transactions: [transaction()],
      bankLinks: [{
        status: 'healthy',
        createdAt: '2026-08-10T00:00:00.000Z',
        lastSyncedAt: '2026-08-10T11:00:00.000Z',
      }],
      checkedAt: '2026-08-10T12:00:00.000Z',
    });

    expect(report.status).toBe('good');
    expect(report.score).toBe(100);
    expect(report.accountCoverage).toBe(1);
  });

  it('does not call a connected institution healthy before accounts import', () => {
    const report = assessDataQuality({
      accounts: [],
      transactions: [],
      bankLinks: [{
        status: 'healthy',
        createdAt: '2026-08-10T11:00:00.000Z',
        lastSyncedAt: '2026-08-10T11:30:00.000Z',
      }],
      checkedAt: '2026-08-10T12:00:00.000Z',
    });

    expect(report.status).toBe('attention');
    expect(report.issues.map((issue) => issue.code)).toContain('incomplete_import');
  });
});
