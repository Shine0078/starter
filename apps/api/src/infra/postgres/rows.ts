/**
 * Row shapes and mappers between snake_case Postgres columns and the
 * camelCase domain types.
 *
 * Hand-written on purpose. An ORM would generate this, but it would also put
 * the persistence layer's opinions inside the domain types — which is exactly
 * what ADR-0002 is trying to prevent. The mapping is boring and it stays boring.
 */

import type { Account, Budget, CategorizationRule, Transaction } from '../../domain/types';

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  mask: string;
  currency: string;
  balance_current: number;
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
  category_slug: string;
  category_source: string;
  category_confidence: number;
  is_recurring: boolean;
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
    categorySlug: row.category_slug,
    categorySource: row.category_source as Transaction['categorySource'],
    categoryConfidence: row.category_confidence,
    isRecurring: row.is_recurring,
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
