import { describe, expect, it } from 'vitest';

import { cashFlowInsight, compareCategoryTotals, rankInsights, summarizePeriod } from '../src/domain/insights/insights';
import { computeHealthScore } from '../src/domain/health-score/score';
import { detectRecurringIncome, forecastCashFlow } from '../src/domain/insights/cash-flow-forecast';
import { buildCreditCardPlans } from '../src/domain/credit-cards/payment-plan';
import { simulatePurchase } from '../src/domain/insights/purchase-simulator';
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

  it('does not mix currencies when producing a reporting period', () => {
    const rows = [
      txn({ amount: 500_000, categorySlug: 'salary', currency: 'USD' }),
      txn({ amount: -120_000, categorySlug: 'rent', currency: 'USD' }),
      txn({ amount: 700_000, categorySlug: 'salary', currency: 'CAD' }),
      txn({ amount: -300_000, categorySlug: 'rent', currency: 'CAD' }),
    ];

    const usd = summarizePeriod(rows, AUGUST, 'USD');
    const cad = summarizePeriod(rows, AUGUST, 'CAD');

    expect(usd.income).toBe(500_000);
    expect(usd.expenses).toBe(120_000);
    expect(cad.income).toBe(700_000);
    expect(cad.expenses).toBe(300_000);
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

describe('rankInsights', () => {
  it('surfaces a material cash shortfall above trend noise', () => {
    const categoryChange = compareCategoryTotals(
      summarizePeriod([
        txn({ amount: -30_000, categorySlug: 'restaurants', postedAt: '2026-08-05' }),
      ], AUGUST, 'USD'),
      summarizePeriod([
        txn({ amount: -10_000, categorySlug: 'restaurants', postedAt: '2026-07-05' }),
      ], JULY, 'USD'),
      [],
    )[0]!;
    const shortfall = cashFlowInsight(summarizePeriod([
      txn({ amount: 100_000, categorySlug: 'salary' }),
      txn({ amount: -180_000, categorySlug: 'rent' }),
    ], AUGUST, 'USD'))!;

    const ranked = rankInsights([categoryChange, shortfall]);

    expect(ranked[0]).toMatchObject({
      kind: 'overspending',
      priority: 'critical',
    });
    expect(ranked[0]!.priorityScore).toBeGreaterThan(ranked[1]!.priorityScore!);
  });

  it('keeps equal scores in their original order and adds an explainable tier', () => {
    const insights = rankInsights([
      {
        kind: 'positive_trend',
        severity: 'info',
        title: 'A',
        detail: 'A',
        evidenceTransactionIds: [],
      },
      {
        kind: 'positive_trend',
        severity: 'info',
        title: 'B',
        detail: 'B',
        evidenceTransactionIds: [],
      },
    ]);

    expect(insights.map((insight) => insight.title)).toEqual(['A', 'B']);
    expect(insights[0]).toMatchObject({ priority: 'informational', priorityScore: 10 });
  });
});

describe('cash-flow forecast', () => {
  const liquidAccounts: Account[] = [
    { id: 'checking', name: 'Checking', type: 'checking', mask: '0001', currency: 'USD', balanceCurrent: 100_000 },
    // Credit limits are not cash and must never make an outlook look safer.
    { id: 'visa', name: 'Visa', type: 'credit_card', mask: '0002', currency: 'USD', balanceCurrent: -50_000, creditLimit: 500_000 },
  ];

  const regularRows = [
    txn({ amount: 50_000, categorySlug: 'salary', normalizedDescriptor: 'acme payroll', merchant: 'Acme', postedAt: '2026-07-17' }),
    txn({ amount: 50_000, categorySlug: 'salary', normalizedDescriptor: 'acme payroll', merchant: 'Acme', postedAt: '2026-07-24' }),
    txn({ amount: 50_000, categorySlug: 'salary', normalizedDescriptor: 'acme payroll', merchant: 'Acme', postedAt: '2026-07-31' }),
    txn({ amount: 50_000, categorySlug: 'salary', normalizedDescriptor: 'acme payroll', merchant: 'Acme', postedAt: '2026-08-07' }),
    txn({ amount: -80_000, categorySlug: 'rent', normalizedDescriptor: 'landlord rent', merchant: 'Landlord', postedAt: '2026-05-01' }),
    txn({ amount: -80_000, categorySlug: 'rent', normalizedDescriptor: 'landlord rent', merchant: 'Landlord', postedAt: '2026-06-01' }),
    txn({ amount: -80_000, categorySlug: 'rent', normalizedDescriptor: 'landlord rent', merchant: 'Landlord', postedAt: '2026-07-01' }),
  ];

  it('projects only repeatable income and bills, with a daily liquid-cash series', () => {
    const forecast = forecastCashFlow(liquidAccounts, regularRows, '2026-08-07', 30);

    expect(forecast.startingBalance).toBe(100_000);
    expect(forecast.points).toHaveLength(30);
    expect(forecast.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-08-14', amount: 50_000, kind: 'income', merchant: 'Acme' }),
        expect.objectContaining({ date: '2026-09-01', amount: -80_000, kind: 'expense', merchant: 'Landlord' }),
      ]),
    );
    expect(forecast.points.find((point) => point.date === '2026-08-14')?.balance).toBe(150_000);
    expect(forecast.points.find((point) => point.date === '2026-09-01')?.balance).toBe(170_000);
  });

  it('does not treat irregular deposits as a dependable pay cheque', () => {
    const rows = [
      txn({ amount: 30_000, categorySlug: 'freelance', normalizedDescriptor: 'side work', postedAt: '2026-06-02' }),
      txn({ amount: 45_000, categorySlug: 'freelance', normalizedDescriptor: 'side work', postedAt: '2026-06-19' }),
      txn({ amount: 12_000, categorySlug: 'freelance', normalizedDescriptor: 'side work', postedAt: '2026-07-28' }),
    ];
    expect(detectRecurringIncome(rows)).toEqual([]);
  });

  it('keeps semimonthly payroll on the first and fifteenth instead of drifting by days', () => {
    const payroll = [
      txn({ amount: 250_000, categorySlug: 'salary', normalizedDescriptor: 'payroll', postedAt: '2026-06-01' }),
      txn({ amount: 250_000, categorySlug: 'salary', normalizedDescriptor: 'payroll', postedAt: '2026-06-15' }),
      txn({ amount: 250_000, categorySlug: 'salary', normalizedDescriptor: 'payroll', postedAt: '2026-07-01' }),
      txn({ amount: 250_000, categorySlug: 'salary', normalizedDescriptor: 'payroll', postedAt: '2026-07-15' }),
      txn({ amount: 250_000, categorySlug: 'salary', normalizedDescriptor: 'payroll', postedAt: '2026-08-01' }),
    ];
    const forecast = forecastCashFlow([], payroll, '2026-08-07', 30);

    expect(forecast.events.map((event) => event.date)).toEqual(['2026-08-15', '2026-09-01']);
  });

  it('rejects horizons outside the supported 7/30/90-day range', () => {
    expect(() => forecastCashFlow([], [], '2026-08-07', 0)).toThrow('1 through 90');
    expect(() => forecastCashFlow([], [], '2026-08-07', 91)).toThrow('1 through 90');
  });
});

describe('credit-card payment plans', () => {
  it('gives an early payment window and the exact amount needed for 30% utilization', () => {
    const [plan] = buildCreditCardPlans(
      [
        {
          id: 'visa', name: 'Visa', type: 'credit_card', mask: '0001', currency: 'USD',
          balanceCurrent: -200_000, creditLimit: 500_000, statementDay: 18, paymentDueDay: 12,
        },
      ],
      '2026-08-07',
    );

    expect(plan).toMatchObject({
      utilization: 0.4,
      payDownToThirtyPercent: 50_000,
      recommendedPayment: 200_000,
      nextStatementDate: '2026-08-18',
      paymentDueDate: '2026-08-12',
      safePaymentWindow: { start: '2026-08-07', end: '2026-08-09' },
    });
    expect(plan?.alerts).toContain('Utilization is above the 30% target.');
  });

  it('recognizes semimonthly dates across short months and never offers a due-date window', () => {
    const [plan] = buildCreditCardPlans(
      [
        {
          id: 'visa', name: 'Visa', type: 'credit_card', mask: '0001', currency: 'USD',
          balanceCurrent: -1, creditLimit: 100_000, paymentDueDay: 1,
        },
      ],
      '2026-02-28',
    );

    expect(plan?.paymentDueDate).toBe('2026-03-01');
    expect(plan?.safePaymentWindow).toBeNull();
    expect(plan?.alerts[0]).toContain('due in 1 day');
  });

  it('does not create a payment plan for cash accounts or cards without a limit', () => {
    expect(
      buildCreditCardPlans(
        [{ id: 'cash', name: 'Cash', type: 'checking', mask: '0001', currency: 'USD', balanceCurrent: 1 }],
        '2026-08-07',
      ),
    ).toEqual([]);
  });
});

describe('purchase scenarios', () => {
  const accounts: Account[] = [
    { id: 'cash', name: 'Checking', type: 'checking', mask: '0001', currency: 'USD', balanceCurrent: 100_000 },
  ];

  it('shows the balance impact without calling a purchase affordable', () => {
    const scenario = simulatePurchase(accounts, [], '2026-08-07', 7, 25_000, '2026-08-10');

    expect(scenario.balanceBeforePurchase).toBe(100_000);
    expect(scenario.balanceAfterPurchase).toBe(75_000);
    expect(scenario.endingBalance).toBe(75_000);
    expect(scenario.lowBalanceDates).toEqual([]);
    expect(scenario.warnings[0]).toContain('Known recurring commitments remain covered');
    expect(scenario.warnings[1]).toContain('does not predict everyday discretionary spending');
  });

  it('warns when a planned purchase creates a known cash shortfall', () => {
    const scenario = simulatePurchase(accounts, [], '2026-08-07', 7, 125_000, '2026-08-10');

    expect(scenario.lowBalanceDates).toContain('2026-08-10');
    expect(scenario.warnings[0]).toContain('cash shortfall on its purchase date');
  });

  it('rejects a purchase date outside the selected forecast horizon', () => {
    expect(() => simulatePurchase(accounts, [], '2026-08-07', 7, 1, '2026-08-07')).toThrow('2026-08-08');
    expect(() => simulatePurchase(accounts, [], '2026-08-07', 7, 1, '2026-08-15')).toThrow('2026-08-14');
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
