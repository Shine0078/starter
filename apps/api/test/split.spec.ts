import { describe, expect, it } from 'vitest';

import {
  assertSharesReconcile,
  balancesFor,
  computeNetBalances,
  splitEqually,
  suggestSettlements,
} from '../src/domain/split/split';
import type { SplitExpense, SplitSettlement } from '../src/domain/split/types';

function expense(overrides: Partial<SplitExpense>): SplitExpense {
  return {
    id: 'e1',
    groupId: 'g1',
    description: 'Dinner',
    category: 'restaurants',
    amount: 10_000,
    currency: 'USD',
    paidByUserId: 'alice',
    splitMethod: 'equal',
    date: '2026-08-10',
    createdAt: '2026-08-10T12:00:00.000Z',
    participants: [],
    ...overrides,
  };
}

describe('split math', () => {
  it('splits equally and reconciles remainder cents to the leading members', () => {
    const shares = splitEqually(10_000, ['alice', 'bob', 'carol']);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(10_000);
    expect(shares.map((share) => share.amount)).toEqual([3_334, 3_333, 3_333]);
  });

  it('rejects an empty member list', () => {
    expect(() => splitEqually(1_000, [])).toThrow();
  });

  it('accepts explicit shares that sum exactly to the amount', () => {
    expect(() =>
      assertSharesReconcile(10_000, [
        { userId: 'alice', amount: 6_000 },
        { userId: 'bob', amount: 4_000 },
      ]),
    ).not.toThrow();
  });

  it('rejects shares that do not reconcile', () => {
    expect(() =>
      assertSharesReconcile(10_000, [
        { userId: 'alice', amount: 6_000 },
        { userId: 'bob', amount: 5_000 },
      ]),
    ).toThrow();
  });

  it('computes net balances and settles them back to zero', () => {
    const expenses = [
      expense({
        amount: 12_000,
        paidByUserId: 'alice',
        participants: [
          { expenseId: 'e1', userId: 'alice', amount: 4_000 },
          { expenseId: 'e1', userId: 'bob', amount: 4_000 },
          { expenseId: 'e1', userId: 'carol', amount: 4_000 },
        ],
      }),
      expense({
        id: 'e2',
        amount: 6_000,
        paidByUserId: 'bob',
        participants: [
          { expenseId: 'e2', userId: 'alice', amount: 3_000 },
          { expenseId: 'e2', userId: 'bob', amount: 3_000 },
        ],
      }),
    ];
    const balances = computeNetBalances(expenses, [], 'USD');
    expect(balances.get('alice')).toBe(12_000 - 4_000 - 3_000);
    expect(balances.get('bob')).toBe(6_000 - 4_000 - 3_000);
    expect(balances.get('carol')).toBe(-4_000);
  });

  it('applies settlements as a transfer between two members', () => {
    const settlements: SplitSettlement[] = [
      {
        id: 's1',
        groupId: 'g1',
        fromUserId: 'bob',
        toUserId: 'alice',
        amount: 5_000,
        currency: 'USD',
        note: '',
        createdAt: '2026-08-11T00:00:00.000Z',
      },
    ];
    const balances = computeNetBalances([], settlements, 'USD');
    expect(balances.get('bob')).toBe(-5_000);
    expect(balances.get('alice')).toBe(5_000);
  });

  it('suggests the minimum number of settlements to zero everyone out', () => {
    const balances = new Map([
      ['alice', 8_000],
      ['bob', -3_000],
      ['carol', -5_000],
    ]);
    const suggestions = suggestSettlements(balances);
    expect(suggestions).toHaveLength(2);
    const after = new Map(balances);
    for (const suggestion of suggestions) {
      after.set(suggestion.fromUserId, after.get(suggestion.fromUserId)! + suggestion.amount);
      after.set(suggestion.toUserId, after.get(suggestion.toUserId)! - suggestion.amount);
    }
    expect([...after.values()].every((value) => value === 0)).toBe(true);
  });

  it('returns member balances for the requested member order', () => {
    const balances = new Map([['bob', 500], ['alice', -500]]);
    expect(balancesFor(balances, ['alice', 'bob'])).toEqual([
      { userId: 'alice', netAmount: -500 },
      { userId: 'bob', netAmount: 500 },
    ]);
  });
});
