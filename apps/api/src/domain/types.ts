/** Core domain types. Plain data — no classes, no ORM, no framework. */

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'investment'
  | 'cash'
  | 'loan';

/** How a transaction got its category. Surfaced in the UI so users can tell
 *  "you told us this" from "we think this". See ADR-0004. */
export type CategorySource =
  | 'user_rule'
  | 'lexicon'
  | 'model'
  | 'user_manual'
  | 'unknown';

export type BudgetPeriodType = 'weekly' | 'monthly' | 'yearly';

export type RuleMatchType = 'contains' | 'exact' | 'regex';

/** ISO 8601 calendar date, `YYYY-MM-DD`. Dates, not timestamps — a transaction
 *  posts on a day, and timezone-shifting it across a month boundary corrupts
 *  every monthly total. */
export type IsoDate = string;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Last four digits only. We never hold a full account number. */
  mask: string;
  currency: string;
  /** Minor units. For credit cards this is negative when money is owed. */
  balanceCurrent: number;
  /** Credit cards only. Positive, minor units. */
  creditLimit?: number;
  /** Credit cards only. Day of month, 1–31. */
  statementDay?: number;
  /** Credit cards only. Day of month, 1–31. */
  paymentDueDay?: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  /** Aggregator's id. Unique per account — the idempotency key for sync. */
  providerTxnId: string;
  postedAt: IsoDate;
  /** Minor units. Negative = outflow. */
  amount: number;
  currency: string;
  /** Exactly as the bank sent it, preserved for auditability. */
  rawDescriptor: string;
  /** Processor prefixes and reference numbers stripped. What we match against. */
  normalizedDescriptor: string;
  merchant?: string;
  categorySlug: string;
  categorySource: CategorySource;
  /** 0–1. */
  categoryConfidence: number;
  isRecurring: boolean;
  /** Pending transactions can change amount or disappear entirely. */
  pending: boolean;
}

export interface CategorizationRule {
  id: string;
  matchType: RuleMatchType;
  /** Matched against normalizedDescriptor. */
  pattern: string;
  categorySlug: string;
  /** Lower number wins ties. */
  priority: number;
}

export interface Budget {
  id: string;
  categorySlug: string;
  /** Positive, minor units. */
  limitAmount: number;
  currency: string;
  period: BudgetPeriodType;
  rollover: boolean;
}

export interface DateRange {
  start: IsoDate;
  /** Inclusive. */
  end: IsoDate;
}

/** A transaction as it arrives from an aggregator, before we categorize it. */
export interface RawTransaction {
  providerTxnId: string;
  accountId: string;
  postedAt: IsoDate;
  amount: number;
  currency: string;
  descriptor: string;
  pending: boolean;
}
