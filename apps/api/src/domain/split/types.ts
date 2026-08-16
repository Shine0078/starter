/**
 * Shared-expense ("split affairs") domain types.
 *
 * Money stays in integer minor units, matching the rest of the domain
 * (ADR-0003). A group is shared between FINVERSE users; membership — not a
 * `user_id` column — decides who may see it, which is why the store port takes
 * the acting user on every method.
 */

export type SplitRole = 'admin' | 'member';
export type SplitMethod = 'equal' | 'shares';

export interface SplitGroup {
  id: string;
  name: string;
  currency: string;
  createdBy: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface SplitGroupMember {
  groupId: string;
  userId: string;
  role: SplitRole;
  joinedAt: string;
}

export interface SplitParticipant {
  expenseId: string;
  userId: string;
  /** Positive minor units this member owes for the expense. */
  amount: number;
}

export interface SplitExpense {
  id: string;
  groupId: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  paidByUserId: string;
  splitMethod: SplitMethod;
  date: string;
  createdAt: string;
  participants: SplitParticipant[];
}

export interface SplitSettlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  note: string;
  createdAt: string;
}

/** A member's net position in a group. Positive = is owed, negative = owes. */
export interface SplitBalance {
  userId: string;
  netAmount: number;
}

export interface SplitSettlementSuggestion {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
