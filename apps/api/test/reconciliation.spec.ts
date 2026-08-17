import { describe, expect, it } from 'vitest';

import {
  computeBalanceAsOf,
  CurrencyMismatchError,
  daysSinceReconciled,
  latestPerAccount,
  reconcile,
} from '../src/domain/reconciliation/balance';
import type { Account, Transaction } from '../src/domain/types';

const CHECKING: Account = {
  id: 'acc_checking',
  name: 'Everyday Checking',
  type: 'checking',
  mask: '4412',
  currency: 'USD',
  balanceCurrent: 100_000, // $1,000.00
};

const CREDIT: Account = {
  id: 'acc_credit',
  name: 'Rewards Visa',
  type: 'credit_card',
  mask: '6411',
  currency: 'USD',
  balanceCurrent: -50_000, // $500.00 owed
  creditLimit: 500_000,
};

let counter = 0;
function txn(overrides: Partial<Transaction> & { amount: number }): Transaction {
  counter += 1;
  return {
    id: `t${counter}`,
    accountId: 'acc_checking',
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

describe('computeBalanceAsOf', () => {
  it('returns the current balance when nothing has posted since', () => {
    const rows = [txn({ amount: -5_000, postedAt: '2026-07-01' })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-31').balance).toBe(100_000);
  });

  it('unwinds an outflow that posted after the date', () => {
    // $1,000 now, $50 spent since — so the balance on the date was $1,050.
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-20' })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(105_000);
  });

  it('unwinds an inflow that posted after the date', () => {
    const rows = [txn({ amount: 25_000, postedAt: '2026-08-20', categorySlug: 'salary' })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(75_000);
  });

  it('counts the statement date itself as already included', () => {
    // A transaction on the closing date is part of the closing balance the user
    // is reading off the statement, so it must not be unwound.
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-15' })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(100_000);
  });

  it('ignores pending rows', () => {
    // `balanceCurrent` is the posted balance and never included these, so
    // unwinding them would remove money that was never there.
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-20', pending: true })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(100_000);
  });

  it('ignores transactions belonging to another account', () => {
    const rows = [txn({ amount: -90_000, postedAt: '2026-08-20', accountId: 'acc_other' })];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(100_000);
  });

  it('nets inflows and outflows', () => {
    const rows = [
      txn({ amount: -5_000, postedAt: '2026-08-20' }),
      txn({ amount: 12_000, postedAt: '2026-08-21' }),
      txn({ amount: -2_000, postedAt: '2026-08-22' }),
    ];
    // now 100_000, net +5_000 since -> was 95_000
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').balance).toBe(95_000);
  });

  it('reports how many rows it unwound', () => {
    const rows = [
      txn({ amount: -1_000, postedAt: '2026-08-20' }),
      txn({ amount: -1_000, postedAt: '2026-08-21', pending: true }),
      txn({ amount: -1_000, postedAt: '2026-08-01' }),
    ];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-08-15').transactionsConsidered).toBe(1);
  });

  it('handles a credit card, where the balance is negative', () => {
    // $500 owed now; a $200 purchase posted since, so $300 was owed then.
    const rows = [txn({ amount: -20_000, postedAt: '2026-08-20', accountId: 'acc_credit' })];
    expect(computeBalanceAsOf(CREDIT, rows, '2026-08-15').balance).toBe(-30_000);
  });

  it('handles a payment reducing a card balance', () => {
    const rows = [
      txn({
        amount: 20_000,
        postedAt: '2026-08-20',
        accountId: 'acc_credit',
        categorySlug: 'credit_card_payment',
      }),
    ];
    // Owed $500 now after a $200 payment, so $700 was owed before it.
    expect(computeBalanceAsOf(CREDIT, rows, '2026-08-15').balance).toBe(-70_000);
  });

  it('crosses a month and a year boundary', () => {
    const rows = [
      txn({ amount: -1_000, postedAt: '2027-01-02' }),
      txn({ amount: -1_000, postedAt: '2026-12-31' }),
    ];
    expect(computeBalanceAsOf(CHECKING, rows, '2026-12-30').balance).toBe(102_000);
  });

  it('is empty-safe', () => {
    expect(computeBalanceAsOf(CHECKING, [], '2026-08-15').balance).toBe(100_000);
  });

  it('handles very large values without precision loss', () => {
    const huge: Account = { ...CHECKING, balanceCurrent: 9_007_199_254_740 };
    const rows = [txn({ amount: -1, postedAt: '2026-08-20' })];
    expect(computeBalanceAsOf(huge, rows, '2026-08-15').balance).toBe(9_007_199_254_741);
  });
});

describe('reconcile', () => {
  it('reports agreement', () => {
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-20' })];
    const outcome = reconcile(CHECKING, rows, '2026-08-15', 105_000, 'USD');

    expect(outcome.status).toBe('balanced');
    expect(outcome.difference).toBe(0);
    expect(outcome.computedBalance).toBe(105_000);
    expect(outcome.explanation).toMatch(/agree/i);
  });

  it('flags money the account has that FINVERSE did not record', () => {
    const outcome = reconcile(CHECKING, [], '2026-08-15', 110_000, 'USD');

    expect(outcome.status).toBe('unbalanced');
    expect(outcome.difference).toBe(10_000);
    expect(outcome.explanation).toContain('$100.00');
    expect(outcome.explanation).toMatch(/deposit or refund/i);
  });

  it('flags money FINVERSE recorded that the account does not have', () => {
    const outcome = reconcile(CHECKING, [], '2026-08-15', 90_000, 'USD');

    expect(outcome.difference).toBe(-10_000);
    expect(outcome.explanation).toMatch(/duplicated|not have cleared/i);
  });

  it('treats a one-cent gap as a real difference', () => {
    // No tolerance band: within one currency the arithmetic is exact, so a
    // small gap is a small real error, not rounding to be absorbed.
    const outcome = reconcile(CHECKING, [], '2026-08-15', 100_001, 'USD');
    expect(outcome.status).toBe('unbalanced');
    expect(outcome.difference).toBe(1);
  });

  it('refuses to reconcile across currencies', () => {
    expect(() => reconcile(CHECKING, [], '2026-08-15', 100_000, 'EUR')).toThrow(
      CurrencyMismatchError,
    );
  });

  it('accepts a differently-cased currency code', () => {
    expect(() => reconcile(CHECKING, [], '2026-08-15', 100_000, 'usd')).not.toThrow();
  });

  it('never mutates the transactions it was given', () => {
    // The whole point of an assertion is that it is evidence, not a correction.
    const rows = [txn({ amount: -5_000, postedAt: '2026-08-20' })];
    const snapshot = JSON.stringify(rows);

    reconcile(CHECKING, rows, '2026-08-15', 1, 'USD');

    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('reconciles a zero balance', () => {
    const empty: Account = { ...CHECKING, balanceCurrent: 0 };
    expect(reconcile(empty, [], '2026-08-15', 0, 'USD').status).toBe('balanced');
  });
});

describe('latestPerAccount', () => {
  const row = (
    accountId: string,
    statementDate: string,
    archivedAt: string | null = null,
  ) => ({ accountId, statementDate, archivedAt });

  it('keeps the newest assertion per account', () => {
    const latest = latestPerAccount([
      row('a', '2026-06-30'),
      row('a', '2026-07-31'),
      row('b', '2026-05-31'),
    ]);

    expect(latest.get('a')?.statementDate).toBe('2026-07-31');
    expect(latest.get('b')?.statementDate).toBe('2026-05-31');
  });

  it('ignores archived assertions', () => {
    const latest = latestPerAccount([
      row('a', '2026-06-30'),
      row('a', '2026-07-31', '2026-08-01T00:00:00.000Z'),
    ]);

    expect(latest.get('a')?.statementDate).toBe('2026-06-30');
  });

  it('omits an account whose only assertion was archived', () => {
    const latest = latestPerAccount([row('a', '2026-07-31', '2026-08-01T00:00:00.000Z')]);
    expect(latest.has('a')).toBe(false);
  });

  it('is empty-safe', () => {
    expect(latestPerAccount([]).size).toBe(0);
  });
});

describe('daysSinceReconciled', () => {
  it('counts whole days', () => {
    expect(daysSinceReconciled('2026-08-01', '2026-08-15')).toBe(14);
  });

  it('is null when never reconciled', () => {
    expect(daysSinceReconciled(undefined, '2026-08-15')).toBeNull();
  });

  it('does not go negative for a future statement date', () => {
    expect(daysSinceReconciled('2026-09-01', '2026-08-15')).toBe(0);
  });

  it('is unaffected by daylight saving transitions', () => {
    // US DST ends 2026-11-01. A local-time implementation returns 7 here.
    expect(daysSinceReconciled('2026-10-28', '2026-11-04')).toBe(7);
  });
});
