import { describe, expect, it } from 'vitest';

import { computeAnalytics } from '../src/domain/insights/analytics';
import type { Transaction } from '../src/domain/types';

let sequence = 0;
function txn(overrides: Partial<Transaction>): Transaction {
  sequence += 1;
  return {
    id: `analytics-${sequence}`,
    accountId: 'checking',
    providerTxnId: `provider-${sequence}`,
    postedAt: '2026-08-05',
    amount: -1_000,
    currency: 'USD',
    rawDescriptor: 'TEST MERCHANT',
    normalizedDescriptor: 'test merchant',
    merchant: 'Test Merchant',
    categorySlug: 'restaurants',
    categorySource: 'lexicon',
    categoryConfidence: 0.9,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

describe('computeAnalytics', () => {
  it('calculates expenses, eligible income, refunds, velocity, and explainable timeline', () => {
    const rows = [
      txn({ id: 'salary', amount: 300_000, categorySlug: 'salary', merchant: 'Employer', isRecurring: true }),
      txn({ id: 'freelance', amount: 50_000, categorySlug: 'freelance', merchant: 'Client', postedAt: '2026-08-06' }),
      txn({ id: 'rent', amount: -120_000, categorySlug: 'rent', merchant: 'Landlord', isRecurring: true }),
      txn({ id: 'restaurant', amount: -20_000, categorySlug: 'restaurants', merchant: 'Restaurant' }),
      txn({ id: 'refund', amount: 5_000, categorySlug: 'refunds', merchant: 'Restaurant' }),
      txn({ id: 'transfer', amount: -30_000, categorySlug: 'transfer', merchant: 'Savings' }),
      txn({ id: 'unknown', amount: -10_000, categorySlug: 'unknown', categorySource: 'unknown', merchant: 'Unknown Shop' }),
      txn({ id: 'cad', amount: -99_999, currency: 'CAD' }),
      txn({ id: 'pending', amount: -99_999, pending: true }),
    ];

    const report = computeAnalytics(
      rows,
      { start: '2026-08-01', end: '2026-08-31' },
      'USD',
      '2026-08-15',
    );

    expect(report.totalIncome).toBe(350_000);
    expect(report.grossExpenses).toBe(150_000);
    expect(report.refunds).toBe(5_000);
    expect(report.netExpenses).toBe(145_000);
    expect(report.savings).toBe(205_000);
    expect(report.essentialSpending).toBe(120_000);
    expect(report.discretionarySpending).toBe(30_000);
    expect(report.recurringSpending).toBe(120_000);
    expect(report.recurringIncome).toBe(300_000);
    expect(report.irregularIncome).toBe(50_000);
    expect(report.expenseCount).toBe(3);
    expect(report.largestExpense?.id).toBe('rent');
    expect(report.timeline.map((event) => event.id)).toContain('salary');
    expect(report.timeline.find((event) => event.id === 'transfer')?.kind).toBe('transfer');
    expect(report.timeline.find((event) => event.id === 'refund')?.kind).toBe('refund');
  });

  it('is empty-safe and does not invent historical velocity', () => {
    const report = computeAnalytics([], { start: '2026-08-01', end: '2026-08-31' }, 'USD');
    expect(report.grossExpenses).toBe(0);
    expect(report.medianExpense).toBe(0);
    expect(report.largestExpense).toBeNull();
    expect(report.velocity.enoughHistory).toBe(false);
    expect(report.velocity.historicalAverageSpend).toBeNull();
  });

  it('omits user-excluded rows from totals while keeping the evidence model intact', () => {
    const report = computeAnalytics(
      [
        txn({ id: 'included', amount: -2_000 }),
        txn({ id: 'excluded', amount: -3_000, excludedFromAnalytics: true }),
      ],
      { start: '2026-08-01', end: '2026-08-31' },
      'USD',
      '2026-08-15',
    );

    expect(report.grossExpenses).toBe(2_000);
    expect(report.expenseCount).toBe(1);
    expect(report.timeline.map((event) => event.id)).toEqual(['included']);
  });

  it('matches a posted refund to the earlier purchase without treating it as income', () => {
    const report = computeAnalytics(
      [
        txn({
          id: 'purchase',
          postedAt: '2026-05-04',
          amount: -10_000,
          categorySlug: 'shopping',
          normalizedDescriptor: 'amzn mktp us',
          merchant: 'Amazon',
        }),
        txn({
          id: 'refund',
          postedAt: '2026-06-02',
          amount: 4_000,
          categorySlug: 'refunds',
          normalizedDescriptor: 'amazon refund',
          merchant: 'Amazon Refund',
        }),
      ],
      { start: '2026-06-01', end: '2026-06-30' },
      'USD',
      '2026-06-30',
    );

    expect(report.totalIncome).toBe(0);
    expect(report.refundMatches).toEqual([
      expect.objectContaining({
        refundId: 'refund',
        purchaseId: 'purchase',
        amount: 4_000,
        purchaseAmount: 10_000,
      }),
    ]);
  });
});
