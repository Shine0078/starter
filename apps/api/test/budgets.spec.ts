import { describe, expect, it } from 'vitest';

import { FixedClock } from '../src/infra/clock';
import { InMemoryBudgetStore, InMemoryTransactionStore } from '../src/infra/in-memory-store';
import { BudgetsService } from '../src/modules/budgets/budgets.service';
import {
  budgetAlerts,
  computeBudgetProgress,
  spendForCategory,
  thresholdFor,
} from '../src/domain/budgets/progress';
import type { Budget, DateRange, Transaction } from '../src/domain/types';

const PERIOD: DateRange = { start: '2026-08-01', end: '2026-08-31' };

const BUDGET: Budget = {
  id: 'bud_1',
  categorySlug: 'restaurants',
  limitAmount: 20_000,
  currency: 'USD',
  period: 'monthly',
  rollover: false,
};

function txn(overrides: Partial<Transaction> & { amount: number }): Transaction {
  return {
    id: `t${Math.random()}`,
    accountId: 'acc',
    providerTxnId: 'p',
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

describe('thresholdFor', () => {
  // Off-by-one here means an alert that never fires. No stack trace, no error —
  // just a user who blew their budget without being told.
  it.each([
    [0, null],
    [49.99, null],
    [50, 50],
    [74.99, 50],
    [75, 75],
    [89.99, 75],
    [90, 90],
    [99.99, 90],
    [100, 100],
    [250, 100],
  ])('%s%% -> %s', (percent, expected) => {
    expect(thresholdFor(percent)).toBe(expected);
  });
});

describe('spendForCategory', () => {
  it('counts outflows in the period', () => {
    const rows = [txn({ amount: -5_000 }), txn({ amount: -3_000 })];
    expect(spendForCategory(rows, 'restaurants', PERIOD)).toBe(8_000);
  });

  it('can scope spend to the budget currency', () => {
    const rows = [
      txn({ amount: -5_000 }),
      txn({ amount: -9_000, currency: 'CAD' }),
    ];
    expect(spendForCategory(rows, 'restaurants', PERIOD, 'USD')).toBe(5_000);
  });

  it('ignores transactions outside the period', () => {
    const rows = [txn({ amount: -5_000, postedAt: '2026-07-31' })];
    expect(spendForCategory(rows, 'restaurants', PERIOD)).toBe(0);
  });

  it('ignores pending transactions', () => {
    const rows = [txn({ amount: -5_000, pending: true })];
    expect(spendForCategory(rows, 'restaurants', PERIOD)).toBe(0);
  });

  it('excludes transfers, which are not spending', () => {
    // Moving $500 into savings is not an expense. Counting it would make every
    // budget wrong for anyone who saves.
    const rows = [txn({ amount: -50_000, categorySlug: 'savings' })];
    expect(spendForCategory(rows, 'savings', PERIOD)).toBe(0);
  });

  it('lets a refund reduce spend', () => {
    const rows = [txn({ amount: -5_000 }), txn({ amount: 2_000 })];
    expect(spendForCategory(rows, 'restaurants', PERIOD)).toBe(3_000);
  });

  it('floors at zero when refunds exceed spend', () => {
    const rows = [txn({ amount: -1_000 }), txn({ amount: 5_000 })];
    expect(spendForCategory(rows, 'restaurants', PERIOD)).toBe(0);
  });

  it('counts uncategorized outflows, which still left the account', () => {
    const rows = [txn({ amount: -9_900, categorySlug: 'unknown' })];
    expect(spendForCategory(rows, 'unknown', PERIOD)).toBe(9_900);
  });
});

describe('computeBudgetProgress', () => {
  it('reports the arithmetic', () => {
    const rows = [txn({ amount: -15_000 })];
    const p = computeBudgetProgress(BUDGET, rows, PERIOD, '2026-08-15');

    expect(p.spentAmount).toBe(15_000);
    expect(p.remainingAmount).toBe(5_000);
    expect(p.percentUsed).toBe(75);
    expect(p.status).toBe('warning');
    expect(p.thresholdCrossed).toBe(75);
  });

  it('reports a negative remainder when over budget', () => {
    const rows = [txn({ amount: -25_000 })];
    const p = computeBudgetProgress(BUDGET, rows, PERIOD, '2026-08-31');
    expect(p.remainingAmount).toBe(-5_000);
    expect(p.status).toBe('exceeded');
  });

  it('projects period-end spend from the current pace', () => {
    // $5,000 over 10 of 31 days -> ~$15,500 projected.
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-05' })];
    const p = computeBudgetProgress(BUDGET, rows, PERIOD, '2026-08-10');
    expect(p.daysElapsed).toBe(10);
    expect(p.daysRemaining).toBe(21);
    expect(p.projectedSpend).toBe(15_500);
    expect(p.projectedToExceed).toBe(false);
  });

  it('flags a pace that will blow the limit', () => {
    const rows = [txn({ amount: -10_000, postedAt: '2026-08-05' })];
    const p = computeBudgetProgress(BUDGET, rows, PERIOD, '2026-08-10');
    expect(p.projectedSpend).toBe(31_000);
    expect(p.projectedToExceed).toBe(true);
  });

  it('does not divide by zero before the period starts', () => {
    const p = computeBudgetProgress(BUDGET, [], PERIOD, '2026-07-15');
    expect(p.daysElapsed).toBe(0);
    expect(p.projectedSpend).toBe(0);
    expect(Number.isFinite(p.percentUsed)).toBe(true);
  });

  it('clamps elapsed days to the period length after it ends', () => {
    const p = computeBudgetProgress(BUDGET, [], PERIOD, '2026-09-20');
    expect(p.daysElapsed).toBe(31);
    expect(p.daysRemaining).toBe(0);
  });
});

describe('budgetAlerts', () => {
  it('alerts on a newly crossed threshold', () => {
    const p = computeBudgetProgress(BUDGET, [txn({ amount: -18_000 })], PERIOD, '2026-08-15');
    const alerts = budgetAlerts(p);
    expect(alerts.some((a) => a.threshold === 90)).toBe(true);
  });

  it('does not repeat an alert the user already saw', () => {
    // Re-alerting on every sync is how users end up muting notifications, at
    // which point the 100% alert never lands either.
    const p = computeBudgetProgress(BUDGET, [txn({ amount: -18_000 })], PERIOD, '2026-08-15');
    const alerts = budgetAlerts(p, new Set([90]));
    expect(alerts.some((a) => a.threshold === 90)).toBe(false);
  });

  it('escalates severity at 100%', () => {
    const p = computeBudgetProgress(BUDGET, [txn({ amount: -21_000 })], PERIOD, '2026-08-20');
    expect(budgetAlerts(p).find((a) => a.threshold === 100)?.severity).toBe('critical');
  });

  it('suppresses a pace warning with too little time left to act', () => {
    const rows = [txn({ amount: -19_000, postedAt: '2026-08-01' })];
    const p = computeBudgetProgress(BUDGET, rows, PERIOD, '2026-08-30');
    expect(p.daysRemaining).toBe(1);
    expect(budgetAlerts(p).some((a) => a.threshold === 'projection')).toBe(false);
  });
});

describe('BudgetsService currency scoping', () => {
  it('keeps a reporting PDF from mixing budget currencies', async () => {
    const budgetStore = new InMemoryBudgetStore();
    const transactionStore = new InMemoryTransactionStore();
    const service = new BudgetsService(
      budgetStore,
      transactionStore,
      new FixedClock('2026-08-10'),
    );
    await budgetStore.create('user-1', { ...BUDGET, id: 'usd-budget' });
    await budgetStore.create('user-1', { ...BUDGET, id: 'cad-budget', currency: 'CAD' });
    await transactionStore.upsertMany('user-1', [
      txn({ id: 'usd-tx', providerTxnId: 'usd-provider', amount: -5_000, currency: 'USD' }),
      txn({ id: 'cad-tx', providerTxnId: 'cad-provider', amount: -7_000, currency: 'CAD' }),
    ]);

    const usd = await service.progress('user-1', '2026-08-10', 'USD');
    const cad = await service.progress('user-1', '2026-08-10', 'CAD');

    expect(usd.map((row) => row.currency)).toEqual(['USD']);
    expect(usd[0]?.spentAmount).toBe(5_000);
    expect(cad.map((row) => row.currency)).toEqual(['CAD']);
    expect(cad[0]?.spentAmount).toBe(7_000);
  });
});
