/**
 * Pure split math. No I/O, no clocks — these exist to be proven by unit tests
 * and shared unchanged by both store adapters and the Flutter client.
 */

import type {
  SplitBalance,
  SplitExpense,
  SplitSettlement,
  SplitSettlementSuggestion,
} from './types';

export interface Share {
  userId: string;
  amount: number;
}

/**
 * Splits `amount` equally across members so the shares sum exactly back to the
 * original. Remainder minor units are distributed one each to the leading
 * members rather than rounded away, so a $10 split three ways is 334/333/333
 * and never 333/333/333 (which loses a cent).
 */
export function splitEqually(amount: number, memberIds: readonly string[]): Share[] {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError('amount must be a positive integer');
  }
  if (memberIds.length === 0) {
    throw new RangeError('at least one member is required');
  }
  const base = Math.floor(amount / memberIds.length);
  let remainder = amount - base * memberIds.length;
  return memberIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, amount: base + extra };
  });
}

/**
 * Validates explicit shares: every member is present exactly once, every share
 * is positive, and the shares sum exactly to `amount`.
 */
export function assertSharesReconcile(
  amount: number,
  shares: readonly Share[],
): void {
  const seen = new Set<string>();
  let total = 0;
  for (const share of shares) {
    if (!Number.isInteger(share.amount) || share.amount <= 0) {
      throw new RangeError('every share must be a positive integer');
    }
    if (seen.has(share.userId)) throw new RangeError('duplicate share for a member');
    seen.add(share.userId);
    total += share.amount;
  }
  if (total !== amount) {
    throw new RangeError(`shares total ${total}, expected ${amount}`);
  }
}

/**
 * Net position per member: what the group owes a member (positive) minus what
 * they owe others (negative). Expenses and settlements are both summed, so the
 * numbers reconcile to zero across a group.
 */
export function computeNetBalances(
  expenses: readonly SplitExpense[],
  settlements: readonly SplitSettlement[],
  currency: string,
): Map<string, number> {
  const balances = new Map<string, number>();
  const bump = (userId: string, delta: number): void => {
    balances.set(userId, (balances.get(userId) ?? 0) + delta);
  };

  for (const expense of expenses) {
    if (expense.currency !== currency) continue;
    bump(expense.paidByUserId, expense.amount);
    for (const participant of expense.participants) {
      bump(participant.userId, -participant.amount);
    }
  }
  for (const settlement of settlements) {
    if (settlement.currency !== currency) continue;
    bump(settlement.fromUserId, -settlement.amount);
    bump(settlement.toUserId, settlement.amount);
  }
  return balances;
}

export function balancesFor(
  balances: Map<string, number>,
  memberIds: readonly string[],
): SplitBalance[] {
  return memberIds.map((userId) => ({
    userId,
    netAmount: balances.get(userId) ?? 0,
  }));
}

/**
 * Reduces a set of net balances to the fewest possible "A pays B" suggestions,
 * so a group of roommates gets one line per debt rather than every pairwise
 * combination. Greedy: settle the largest creditor with the largest debtor.
 */
export function suggestSettlements(balances: Map<string, number>): SplitSettlementSuggestion[] {
  const creditors = [...balances.entries()]
    .filter(([, value]) => value > 0)
    .map(([userId, value]) => ({ userId, amount: value }));
  const debtors = [...balances.entries()]
    .filter(([, value]) => value < 0)
    .map(([userId, value]) => ({ userId, amount: -value }));

  const suggestions: SplitSettlementSuggestion[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amount, debtor.amount);
    suggestions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditors.shift();
    if (debtor.amount === 0) debtors.shift();
  }
  return suggestions;
}
