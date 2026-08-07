import { describe, expect, it } from 'vitest';

import { detectSubscriptions, totalAnnualSubscriptionCost } from '../src/domain/insights/subscriptions';
import type { Transaction } from '../src/domain/types';

function series(
  descriptor: string,
  categorySlug: string,
  charges: ReadonlyArray<{ date: string; amount: number }>,
): Transaction[] {
  return charges.map((c, i) => ({
    id: `${descriptor}-${i}`,
    accountId: 'acc',
    providerTxnId: `${descriptor}-${i}`,
    postedAt: c.date,
    amount: -c.amount,
    currency: 'USD',
    rawDescriptor: descriptor.toUpperCase(),
    normalizedDescriptor: descriptor,
    categorySlug,
    categorySource: 'lexicon',
    categoryConfidence: 0.9,
    isRecurring: false,
    pending: false,
  }));
}

describe('detectSubscriptions', () => {
  it('detects a fixed monthly charge', () => {
    const rows = series('netflix com', 'streaming', [
      { date: '2026-05-14', amount: 1_549 },
      { date: '2026-06-14', amount: 1_549 },
      { date: '2026-07-14', amount: 1_549 },
      { date: '2026-08-14', amount: 1_549 },
    ]);

    const [sub] = detectSubscriptions(rows);
    expect(sub?.cadence).toBe('monthly');
    expect(sub?.typicalAmount).toBe(1_549);
    expect(sub?.annualCost).toBe(1_549 * 12);
    expect(sub?.occurrences).toBe(4);
  });

  it('needs at least three charges', () => {
    const rows = series('netflix com', 'streaming', [
      { date: '2026-06-14', amount: 1_549 },
      { date: '2026-07-14', amount: 1_549 },
    ]);
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  it('does not mistake a frequent habit for a subscription', () => {
    // Lunch four times a month at wandering amounts. A naive "three charges
    // near the median" check reports this as a weekly subscription.
    const rows = series('chipotle', 'fast_food', [
      { date: '2026-07-02', amount: 1_120 },
      { date: '2026-07-09', amount: 3_480 },
      { date: '2026-07-16', amount: 1_875 },
      { date: '2026-07-23', amount: 4_210 },
      { date: '2026-07-30', amount: 2_640 },
      { date: '2026-08-06', amount: 1_390 },
    ]);
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  it('ignores irregular intervals', () => {
    const rows = series('random shop', 'shopping', [
      { date: '2026-05-03', amount: 2_000 },
      { date: '2026-05-19', amount: 2_000 },
      { date: '2026-07-28', amount: 2_000 },
    ]);
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  it('excludes transfers, which recur but are not a cost', () => {
    const rows = series('transfer to savings', 'savings', [
      { date: '2026-05-16', amount: 40_000 },
      { date: '2026-06-16', amount: 40_000 },
      { date: '2026-07-16', amount: 40_000 },
    ]);
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  it('ignores inflows', () => {
    const rows = series('acme payroll', 'salary', [
      { date: '2026-05-01', amount: -512_000 },
      { date: '2026-06-01', amount: -512_000 },
      { date: '2026-07-01', amount: -512_000 },
    ]);
    expect(detectSubscriptions(rows)).toHaveLength(0);
  });

  describe('price changes', () => {
    it('detects a step increase and reports the new price as current', () => {
      const rows = series('netflix com', 'streaming', [
        { date: '2026-04-14', amount: 1_549 },
        { date: '2026-05-14', amount: 1_549 },
        { date: '2026-06-14', amount: 1_799 },
        { date: '2026-07-14', amount: 1_799 },
      ]);

      const [sub] = detectSubscriptions(rows);
      expect(sub?.priceIncrease?.from).toBe(1_549);
      expect(sub?.priceIncrease?.to).toBe(1_799);
      expect(Math.round(sub?.priceIncrease?.percent ?? 0)).toBe(16);
      // Projections must use what they pay now, not a median across both prices.
      expect(sub?.typicalAmount).toBe(1_799);
      expect(sub?.annualCost).toBe(1_799 * 12);
    });

    it('still detects the subscription when only one charge is at the new price', () => {
      // A strict consistency threshold alone would drop this — and a fresh
      // price rise is exactly what the user most wants flagged.
      const rows = series('netflix com', 'streaming', [
        { date: '2026-05-14', amount: 1_549 },
        { date: '2026-06-14', amount: 1_549 },
        { date: '2026-07-14', amount: 1_799 },
      ]);

      const [sub] = detectSubscriptions(rows);
      expect(sub).toBeDefined();
      expect(sub?.priceIncrease?.to).toBe(1_799);
    });

    it('does not report a price drop as an increase', () => {
      const rows = series('gym', 'fitness', [
        { date: '2026-04-17', amount: 4_999 },
        { date: '2026-05-17', amount: 4_999 },
        { date: '2026-06-17', amount: 2_499 },
        { date: '2026-07-17', amount: 2_499 },
      ]);

      const [sub] = detectSubscriptions(rows);
      expect(sub).toBeDefined();
      expect(sub?.priceIncrease).toBeNull();
      expect(sub?.typicalAmount).toBe(2_499);
    });
  });

  it('projects a monthly charge onto the same day of the next month', () => {
    // Not "last charge plus the median interval" — that drifts a subscription
    // earlier every time it passes through a short month.
    const rows = series('spotify usa', 'streaming', [
      { date: '2026-05-06', amount: 1_199 },
      { date: '2026-06-06', amount: 1_199 },
      { date: '2026-07-06', amount: 1_199 },
    ]);
    expect(detectSubscriptions(rows)[0]?.nextExpected).toBe('2026-08-06');
  });

  it('does not let a monthly projection drift through a short month', () => {
    const rows = series('adobe', 'software', [
      { date: '2026-05-31', amount: 2_999 },
      { date: '2026-06-30', amount: 2_999 },
      { date: '2026-07-31', amount: 2_999 },
    ]);
    expect(detectSubscriptions(rows)[0]?.nextExpected).toBe('2026-08-31');
  });

  it('sorts by annual cost, because that is the number worth acting on', () => {
    const rows = [
      ...series('spotify usa', 'streaming', [
        { date: '2026-05-06', amount: 1_199 },
        { date: '2026-06-06', amount: 1_199 },
        { date: '2026-07-06', amount: 1_199 },
      ]),
      ...series('comcast xfinity', 'internet', [
        { date: '2026-05-07', amount: 8_999 },
        { date: '2026-06-07', amount: 8_999 },
        { date: '2026-07-07', amount: 8_999 },
      ]),
    ];
    const detected = detectSubscriptions(rows);
    expect(detected.map((s) => s.normalizedDescriptor)).toEqual(['comcast xfinity', 'spotify usa']);
    expect(totalAnnualSubscriptionCost(detected)).toBe((1_199 + 8_999) * 12);
  });
});
