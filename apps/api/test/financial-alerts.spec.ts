import { describe, expect, it } from 'vitest';

import {
  deriveSubscriptionAlerts,
  deriveUnusualTransactionAlerts,
} from '../src/domain/notifications/financial-alerts';
import type { Transaction } from '../src/domain/types';

function transaction(
  id: string,
  postedAt: string,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    accountId: 'account-1',
    providerTxnId: `provider-${id}`,
    postedAt,
    amount,
    currency: 'USD',
    rawDescriptor: 'STREAM BOX',
    normalizedDescriptor: 'stream box',
    merchant: 'Stream Box',
    categorySlug: 'subscriptions',
    categorySource: 'lexicon',
    categoryConfidence: 1,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

describe('derived financial alerts', () => {
  it('surfaces evidence-backed subscription price changes and upcoming bills', () => {
    const rows = [
      transaction('may', '2026-05-03', -1_000),
      transaction('jun', '2026-06-03', -1_000),
      transaction('jul', '2026-07-03', -1_200),
      transaction('aug', '2026-08-03', -1_200),
    ];

    const alerts = deriveSubscriptionAlerts(rows, '2026-08-28');

    expect(alerts).toHaveLength(2);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'subscription',
          title: 'Subscription price increase',
          message: expect.stringContaining('20% higher'),
        }),
        expect.objectContaining({
          kind: 'bill',
          title: 'Upcoming recurring charge',
          message: expect.stringContaining('in 6 days'),
        }),
      ]),
    );

    const laterAlerts = deriveSubscriptionAlerts(
      [...rows, transaction('sep', '2026-09-03', -1_200)],
      '2026-09-28',
    );
    expect(laterAlerts.find((alert) => alert.kind === 'subscription')?.dedupeKey).toBe(
      alerts.find((alert) => alert.kind === 'subscription')?.dedupeKey,
    );
  });

  it('does not invent a bill reminder outside the seven-day window', () => {
    const rows = [
      transaction('may', '2026-05-03', -1_000),
      transaction('jun', '2026-06-03', -1_000),
      transaction('jul', '2026-07-03', -1_000),
      transaction('aug', '2026-08-03', -1_000),
    ];

    expect(deriveSubscriptionAlerts(rows, '2026-08-20')).toHaveLength(0);
  });

  it('flags exact recent repeats as possible duplicates without calling them fraud', () => {
    const rows = [
      transaction('first', '2026-08-07', -4_250, {
        categorySlug: 'restaurants',
        normalizedDescriptor: 'kozy korner diner',
        merchant: 'Kozy Korner Diner',
      }),
      transaction('second', '2026-08-08', -4_250, {
        categorySlug: 'restaurants',
        normalizedDescriptor: 'kozy korner diner',
        merchant: 'Kozy Korner Diner',
      }),
    ];

    const alerts = deriveUnusualTransactionAlerts(rows, '2026-08-08');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: 'unusual_transaction',
      title: 'Possible duplicate charge',
      severity: 'warning',
    });
    expect(alerts[0]!.message.toLowerCase()).not.toContain('fraud');
  });

  it('flags near-duplicate descriptors when the amount is effectively the same', () => {
    const rows = [
      transaction('first', '2026-08-07', -4_250, {
        categorySlug: 'restaurants',
        normalizedDescriptor: 'blue bottle coffee',
        merchant: 'Blue Bottle Coffee',
      }),
      transaction('second', '2026-08-08', -4_300, {
        categorySlug: 'restaurants',
        normalizedDescriptor: 'blue bottle cafe coffee',
        merchant: 'Blue Bottle Cafe',
      }),
    ];

    const alerts = deriveUnusualTransactionAlerts(rows, '2026-08-08');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toBe('Possible duplicate charge');
    expect(alerts[0]!.message).toContain('similar merchant details');
  });

  it('requires a material six-transaction baseline before flagging a category outlier', () => {
    const history = [
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
      '2026-07-15',
    ].map((date, index) =>
      transaction(`history-${index}`, date, -2_000, {
        categorySlug: 'groceries',
        normalizedDescriptor: `grocery store ${index}`,
        merchant: `Grocery Store ${index}`,
      }),
    );
    const candidate = transaction('candidate', '2026-08-08', -15_000, {
      categorySlug: 'groceries',
      normalizedDescriptor: 'premium grocery',
      merchant: 'Premium Grocery',
    });

    const alerts = deriveUnusualTransactionAlerts([...history, candidate], '2026-08-08');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      title: 'Unusually large transaction',
      dedupeKey: 'category-outlier:candidate',
    });
    expect(alerts[0]!.message).toContain('$150.00');
    expect(
      deriveUnusualTransactionAlerts([...history.slice(0, 5), candidate], '2026-08-08'),
    ).toHaveLength(0);
  });

  it('ignores pending transactions and non-spending transfers', () => {
    const pending = transaction('pending', '2026-08-08', -50_000, {
      categorySlug: 'shopping',
      pending: true,
    });
    const transfer = transaction('transfer', '2026-08-08', -50_000, {
      categorySlug: 'transfer',
      pending: false,
    });

    expect(deriveUnusualTransactionAlerts([pending, transfer], '2026-08-08')).toEqual([]);
  });
});
