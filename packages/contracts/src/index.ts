/**
 * The API surface, as types.
 *
 * This package is the contract between the server and any client. It exists so
 * that a change to a response shape is a compile error in the consumer rather
 * than a runtime surprise, and so that the Flutter models have a single
 * authoritative thing to be generated from later.
 *
 * Monetary fields are integers in minor units and are always accompanied by a
 * preformatted `*Formatted` string. Clients render the string and never
 * re-derive it, so currency formatting cannot drift between platforms.
 */

export type CategorySource =
  | 'user_rule'
  | 'lexicon'
  | 'model'
  | 'user_manual'
  | 'unknown';

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'investment'
  | 'cash'
  | 'loan';

export type BudgetStatus = 'on_track' | 'warning' | 'critical' | 'exceeded';

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface SyncResponse {
  accounts: number;
  fetched: number;
  inserted: number;
  updated: number;
  /** 0–1. Share of transactions that got a category. */
  coverage: number;
  needsReview: number;
  recurringDetected: number;
}

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  /** Last four digits. Never a full account number. */
  mask: string;
  currency: string;
  balanceCurrent: number;
  balanceFormatted: string;
  creditLimit?: number;
  /** 0–1 for credit cards, null otherwise. */
  utilization: number | null;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  postedAt: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  rawDescriptor: string;
  normalizedDescriptor: string;
  merchant?: string;
  categorySlug: string;
  categorySource: CategorySource;
  categoryConfidence: number;
  isRecurring: boolean;
  pending: boolean;
}

export interface RecategorizeRequest {
  categorySlug: string;
  /** Also write a tier-1 rule and backfill matching past transactions. */
  createRule?: boolean;
}

export interface RecategorizeResponse {
  transaction: TransactionDto;
  /** How many past transactions the new rule also corrected. */
  alsoUpdated: number;
  message: string;
}

export interface CreateBudgetRequest {
  categorySlug: string;
  /** Positive integer, minor units. */
  limitAmount: number;
  period?: 'weekly' | 'monthly' | 'yearly';
  currency?: string;
  rollover?: boolean;
}

export interface BudgetProgressDto {
  budgetId: string;
  categorySlug: string;
  categoryName: string;
  limitAmount: number;
  limitFormatted: string;
  spentAmount: number;
  spentFormatted: string;
  remainingAmount: number;
  remainingFormatted: string;
  percentUsed: number;
  thresholdCrossed: 50 | 75 | 90 | 100 | null;
  status: BudgetStatus;
  daysElapsed: number;
  daysRemaining: number;
  projectedSpend: number;
  projectedToExceed: boolean;
  period: { start: string; end: string };
}

export interface BudgetAlertDto {
  budgetId: string;
  categorySlug: string;
  threshold: 50 | 75 | 90 | 100 | 'projection';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface InsightDto {
  kind:
    | 'category_increase'
    | 'category_decrease'
    | 'new_recurring_charge'
    | 'price_increase'
    | 'overspending'
    | 'positive_trend';
  severity: 'info' | 'warning' | 'positive';
  title: string;
  detail: string;
  categorySlug?: string;
  deltaAmount?: number;
  deltaPercent?: number;
  /** Every insight must be traceable to the transactions behind it. */
  evidenceTransactionIds: string[];
}

export interface SubscriptionDto {
  merchant: string;
  normalizedDescriptor: string;
  categorySlug: string;
  cadence: Cadence;
  typicalAmount: number;
  typicalAmountFormatted: string;
  annualCost: number;
  annualCostFormatted: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string;
  priceIncrease: { from: number; to: number; percent: number } | null;
  /** 0–1. */
  confidence: number;
}

export type ScoreComponentKey =
  | 'savings_rate'
  | 'credit_utilization'
  | 'budget_adherence'
  | 'emergency_fund'
  | 'payment_history'
  | 'cash_flow';

export interface ScoreComponentDto {
  key: ScoreComponentKey;
  label: string;
  points: number;
  maxPoints: number;
  ratio: number;
  detail: string;
  /** Null when the component is already maxed out. */
  action: string | null;
}

export interface HealthScoreResponse {
  /** 0–1000. */
  score: number;
  band: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
  components: ScoreComponentDto[];
  /** Highest-leverage actions first. */
  topActions: string[];
}
