import { describe, expect, it } from 'vitest';

import { cashFlowInsight, compareCategoryTotals, summarizePeriod } from '../src/domain/insights/insights';
import { computeHealthScore } from '../src/domain/health-score/score';
import type { Account, DateRange, Transaction } from '../src/domain/types';

const AUGUST: DateRange = { start: '2026-08-01', end: '2026-08-31' };
const JULY: DateRange = { start: '2026-07-01', end: '2026-07-31' };

let counter = 0;
function txn(overrides: Partial<Transaction> & { amount: number }): Transaction {
  counter += 1;
  return {
    id: `t${counter}`,
    accountId: 'acc',
    providerTxnId: `p${counter}`,
    postedAt: '2026-08-10',
    currency: 'USD',
    rawDescriptor: 'TEST',
    normalizedDescriptor: 'test',
    categorySlug: 'restaurants',
    categorySource: 'lexicon',
    categoryConfidence: 0.9,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

describe('summarizePeriod', () => {
  it('separates income from expenses', () => {
    const rows = [
      txn({ amount: 500_000, categorySlug: 'salary' }),
      txn({ amount: -120_000, categorySlug: 'rent' }),
      txn({ amount: -30_000, categorySlug: 'groceries' }),
    ];
    const s = summarizePeriod(rows, AUGUST, 'USD');

    expect(s.income).toBe(500_000);
    expect(s.expenses).toBe(150_000);
    expect(s.netCashFlow).toBe(350_000);
    expect(s.savingsRate).toBeCloseTo(70, 5);
  });

  it('excludes transfers from both sides', () => {
    const rows = [
      txn({ amount: 500_000, categorySlug: 'salary' }),
      txn({ amount: -100_000, categorySlug: 'savings' }),
    ];
    const s = summarizePeriod(rows, AUGUST, 'USD');
    expect(s.expenses).toBe(0);
    expect(s.netCashFlow).toBe(500_000);
  });

  it('counts uncategorized outflows as expenses', () => {
    // Money that left the account has to appear somewhere, or the savings rate
    // is a fiction. A missed rent payment is the worst thing to drop silently.
    const rows = [
      txn({ amount: 500_000, categorySlug: 'salary' }),
      txn({ amount: -218_000, categorySlug: 'unknown' }),
    ];
    const s = summarizePeriod(rows, AUGUST, 'USD');
    expect(s.expenses).toBe(218_000);
    expect(s.savingsRate).toBeCloseTo(56.4, 1);
  });

  it('ignores pending transactions', () => {
    const rows = [txn({ amount: -10_000, pending: true })];
    expect(summarizePeriod(rows, AUGUST, 'USD').expenses).toBe(0);
  });

  it('never reports a negative savings rate', () => {
    const rows = [
      txn({ amount: 100_000, categorySlug: 'salary' }),
      txn({ amount: -300_000, categorySlug: 'rent' }),
    ];
    expect(summarizePeriod(rows, AUGUST, 'USD').savingsRate).toBe(0);
  });

  it('handles zero income without dividing by zero', () => {
    const s = summarizePeriod([txn({ amount: -5_000 })], AUGUST, 'USD');
    expect(s.savingsRate).toBe(0);
    expect(Number.isFinite(s.savingsRate)).toBe(true);
  });

  it('finds the top merchant, biggest day, and daily average', () => {
    const rows = [
      txn({ amount: -10_000, merchant: 'Amazon', postedAt: '2026-08-02' }),
      txn({ amount: -5_000, merchant: 'Amazon', postedAt: '2026-08-03' }),
      txn({ amount: -12_000, merchant: 'Best Buy', postedAt: '2026-08-03' }),
    ];
    const s = summarizePeriod(rows, AUGUST, 'USD');

    expect(s.topMerchant).toEqual({ merchant: 'Amazon', total: 15_000, count: 2 });
    expect(s.mostExpensiveDay).toEqual({ date: '2026-08-03', total: 17_000 });
    expect(s.averageDailySpend).toBe(Math.round(27_000 / 31));
  });

  it('is empty-safe', () => {
    const s = summarizePeriod([], AUGUST, 'USD');
    expect(s.topMerchant).toBeNull();
    expect(s.mostExpensiveDay).toBeNull();
    expect(s.largestTransaction).toBeNull();
    expect(s.expenses).toBe(0);
  });
});

describe('compareCategoryTotals', () => {
  const rows = [
    txn({ amount: -40_000, categorySlug: 'restaurants', postedAt: '2026-08-05' }),
    txn({ amount: -10_000, categorySlug: 'restaurants', postedAt: '2026-07-05' }),
  ];

  it('reports a material increase with evidence', () => {
    const current = summarizePeriod(rows, AUGUST, 'USD');
    const previous = summarizePeriod(rows, JULY, 'USD');
    const insights = compareCategoryTotals(current, previous, rows);

    const restaurants = insights.find((i) => i.categorySlug === 'restaurants');
    expect(restaurants?.kind).toBe('category_increase');
    expect(restaurants?.deltaAmount).toBe(30_000);
    expect(restaurants?.evidenceTransactionIds.length).toBe(1);
  });

  it('ignores swings on trivial amounts', () => {
    // A 300% jump on a $2 category is noise, not an insight.
    const small = [
      txn({ amount: -300, categorySlug: 'coffee', postedAt: '2026-08-05' }),
      txn({ amount: -100, categorySlug: 'coffee', postedAt: '2026-07-05' }),
    ];
    const insights = compareCategoryTotals(
      summarizePeriod(small, AUGUST, 'USD'),
      summarizePeriod(small, JULY, 'USD'),
      small,
    );
    expect(insights).toHaveLength(0);
  });

  it('handles a category that is new this period', () => {
    const fresh = [txn({ amount: -50_000, categorySlug: 'travel', postedAt: '2026-08-05' })];
    const insights = compareCategoryTotals(
      summarizePeriod(fresh, AUGUST, 'USD'),
      summarizePeriod(fresh, JULY, 'USD'),
      fresh,
    );
    expect(insights[0]?.kind).toBe('category_increase');
  });

  it('sorts by absolute impact', () => {
    const many = [
      txn({ amount: -90_000, categorySlug: 'travel', postedAt: '2026-08-05' }),
      txn({ amount: -30_000, categorySlug: 'restaurants', postedAt: '2026-08-05' }),
    ];
    const insights = compareCategoryTotals(
      summarizePeriod(many, AUGUST, 'USD'),
      summarizePeriod(many, JULY, 'USD'),
      many,
    );
    expect(insights[0]?.categorySlug).toBe('travel');
  });
});

describe('cashFlowInsight', () => {
  it('warns when expenses exceed income', () => {
    const rows = [
      txn({ amount: 100_000, categorySlug: 'salary' }),
      txn({ amount: -180_000, categorySlug: 'rent' }),
    ];
    const insight = cashFlowInsight(summarizePeriod(rows, AUGUST, 'USD'));
    expect(insight?.kind).toBe('overspending');
    expect(insight?.deltaAmount).toBe(-80_000);
  });

  it('stays quiet when cash flow is positive', () => {
    const rows = [
      txn({ amount: 100_000, categorySlug: 'salary' }),
      txn({ amount: -20_000, categorySlug: 'rent' }),
    ];
    expect(cashFlowInsight(summarizePeriod(rows, AUGUST, 'USD'))).toBeNull();
  });
});

describe('computeHealthScore', () => {
  const accounts: Account[] = [
    { id: 'a1', name: 'Checking', type: 'checking', mask: '0001', currency: 'USD', balanceCurrent: 300_000 },
    { id: 'a2', name: 'Savings', type: 'savings', mask: '0002', currency: 'USD', balanceCurrent: 600_000 },
    {
      id: 'a3',
      name: 'Visa',
      type: 'credit_card',
      mask: '0003',
      currency: 'USD',
      balanceCurrent: -100_000,
      creditLimit: 500_000,
    },
  ];

  const rows = [
    txn({ amount: 500_000, categorySlug: 'salary' }),
    txn({ amount: -200_000, categorySlug: 'rent' }),
  ];
  const summary = summarizePeriod(rows, AUGUST, 'USD');

  it('stays within 0..1000', () => {
    const score = computeHealthScore({ summary, accounts, transactions: rows, budgetAdherenceRatio: 1 });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(1000);
  });

  it('explains every component', () => {
    const score = computeHealthScore({ summary, accounts, transactions: rows, budgetAdherenceRatio: 1 });
    expect(score.components).toHaveLength(6);
    for (const c of score.components) {
      expect(c.detail.length).toBeGreaterThan(0);
      expect(c.points).toBeLessThanOrEqual(c.maxPoints);
      expect(c.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('penalises high credit utilization', () => {
    const maxed = accounts.map((a) =>
      a.type === 'credit_card' ? { ...a, balanceCurrent: -450_000 } : a,
    );
    const good = computeHealthScore({ summary, accounts, transactions: rows, budgetAdherenceRatio: 1 });
    const bad = computeHealthScore({
      summary,
      accounts: maxed,
      transactions: rows,
      budgetAdherenceRatio: 1,
    });
    expect(bad.score).toBeLessThan(good.score);

    const component = bad.components.find((c) => c.key === 'credit_utilization');
    expect(component?.action).toContain('30%');
  });

  it('treats having no budgets as neutral, not as a failure', () => {
    const none = computeHealthScore({
      summary,
      accounts,
      transactions: rows,
      budgetAdherenceRatio: null,
    });
    const component = none.components.find((c) => c.key === 'budget_adherence');
    expect(component?.ratio).toBe(0.7);
    expect(component?.action).toContain('Set a budget');
  });

  it('docks payment history when fees appear', () => {
    const withFee = [...rows, txn({ amount: -3_500, categorySlug: 'fees' })];
    const score = computeHealthScore({
      summary,
      accounts,
      transactions: withFee,
      budgetAdherenceRatio: 1,
    });
    const component = score.components.find((c) => c.key === 'payment_history');
    expect(component?.points).toBeLessThan(component!.maxPoints);
  });

  it('surfaces at most three actions, worst gap first', () => {
    const broke = summarizePeriod(
      [txn({ amount: 100_000, categorySlug: 'salary' }), txn({ amount: -300_000, categorySlug: 'rent' })],
      AUGUST,
      'USD',
    );
    const score = computeHealthScore({
      summary: broke,
      accounts: [],
      transactions: [],
      budgetAdherenceRatio: null,
    });
    expect(score.topActions.length).toBeGreaterThan(0);
    expect(score.topActions.length).toBeLessThanOrEqual(3);
  });
});
