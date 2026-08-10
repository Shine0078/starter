/**
 * Row shapes and mappers between snake_case Postgres columns and the
 * camelCase domain types.
 *
 * Hand-written on purpose. An ORM would generate this, but it would also put
 * the persistence layer's opinions inside the domain types — which is exactly
 * what ADR-0002 is trying to prevent. The mapping is boring and it stays boring.
 */

import type {
  Account,
  Budget,
  CategorizationRule,
  GoalContribution,
  NotificationPreferences,
  SavingsGoal,
  UserNotification,
  Transaction,
} from '../../domain/types';

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  mask: string;
  currency: string;
  balance_current: number;
  source: 'provider' | 'manual';
  credit_limit: number | null;
  statement_day: number | null;
  payment_due_day: number | null;
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Account['type'],
    mask: row.mask,
    currency: row.currency,
    balanceCurrent: row.balance_current,
    // Keep the historical provider-account shape stable across adapters while
    // retaining the provenance marker needed to authorize manual edits.
    ...(row.source === 'manual' ? { source: 'manual' as const } : {}),
    // Omit rather than pass null: the domain type declares these optional, and
    // `creditLimit: null` would defeat every `?? 0` guard downstream.
    ...(row.credit_limit === null ? {} : { creditLimit: row.credit_limit }),
    ...(row.statement_day === null ? {} : { statementDay: row.statement_day }),
    ...(row.payment_due_day === null ? {} : { paymentDueDay: row.payment_due_day }),
  };
}

export interface TransactionRow {
  id: string;
  account_id: string;
  provider_txn_id: string;
  /** Returned as a `YYYY-MM-DD` string — see the DATE parser in pool.ts. */
  posted_at: string;
  amount: number;
  currency: string;
  raw_descriptor: string;
  normalized_descriptor: string;
  merchant: string | null;
  merchant_override: string | null;
  note: string | null;
  excluded_from_analytics: boolean;
  category_slug: string;
  category_source: string;
  category_confidence: number;
  is_recurring: boolean;
  recurring_override: boolean | null;
  pending: boolean;
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    providerTxnId: row.provider_txn_id,
    postedAt: row.posted_at,
    amount: row.amount,
    currency: row.currency,
    rawDescriptor: row.raw_descriptor,
    normalizedDescriptor: row.normalized_descriptor,
    ...(row.merchant === null ? {} : { merchant: row.merchant }),
    ...(row.merchant_override === null ? {} : { merchantOverride: row.merchant_override }),
    ...(row.note === null ? {} : { note: row.note }),
    ...(row.excluded_from_analytics === true ? { excludedFromAnalytics: true } : {}),
    categorySlug: row.category_slug,
    categorySource: row.category_source as Transaction['categorySource'],
    categoryConfidence: row.category_confidence,
    isRecurring: row.recurring_override ?? row.is_recurring,
    ...(row.recurring_override === null ? {} : { recurringOverride: row.recurring_override }),
    pending: row.pending,
  };
}

export interface BudgetRow {
  id: string;
  category_slug: string;
  limit_amount: number;
  currency: string;
  period: string;
  rollover: boolean;
}

export function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categorySlug: row.category_slug,
    limitAmount: row.limit_amount,
    currency: row.currency,
    period: row.period as Budget['period'],
    rollover: row.rollover,
  };
}

export interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  currency: string;
  target_date: string | null;
  created_at: string;
}

export function toGoal(row: GoalRow): SavingsGoal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount,
    currency: row.currency,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

export interface GoalContributionRow {
  id: string;
  goal_id: string;
  amount: number;
  contributed_at: string;
}

export function toGoalContribution(row: GoalContributionRow): GoalContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    amount: row.amount,
    contributedAt: row.contributed_at,
  };
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  message: string;
  severity: string;
  dedupe_key: string;
  read_at: Date | null;
  created_at: Date;
}

export function toNotification(row: NotificationRow): UserNotification {
  return {
    id: row.id,
    kind: row.kind as UserNotification['kind'],
    title: row.title,
    message: row.message,
    severity: row.severity as UserNotification['severity'],
    dedupeKey: row.dedupe_key,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export interface NotificationPreferenceRow {
  budget: boolean;
  bills: boolean;
  credit_utilization: boolean;
  subscriptions: boolean;
  low_balance: boolean;
  unusual_transactions: boolean;
  bank_sync: boolean;
  security: boolean;
}

export function toNotificationPreferences(row: NotificationPreferenceRow): NotificationPreferences {
  return {
    budget: row.budget,
    bills: row.bills,
    creditUtilization: row.credit_utilization,
    subscriptions: row.subscriptions,
    lowBalance: row.low_balance,
    unusualTransactions: row.unusual_transactions,
    bankSync: row.bank_sync,
    security: row.security,
  };
}

export interface RuleRow {
  id: string;
  match_type: string;
  pattern: string;
  category_slug: string;
  priority: number;
}

export function toRule(row: RuleRow): CategorizationRule {
  return {
    id: row.id,
    matchType: row.match_type as CategorizationRule['matchType'],
    pattern: row.pattern,
    categorySlug: row.category_slug,
    priority: row.priority,
  };
}

/**
 * `$1, $2, $3` for a single row, offset into a shared parameter list.
 * Used to build multi-row INSERTs without string-concatenating any values.
 */
export function placeholders(columnCount: number, rowIndex: number): string {
  const base = rowIndex * columnCount;
  return `(${Array.from({ length: columnCount }, (_, i) => `$${base + i + 1}`).join(', ')})`;
}

/** Postgres caps a statement at 65535 bound parameters. Chunk well under it. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
