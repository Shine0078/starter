import { getCategory, isIncomeCategory } from '../categories';
import type { StatementRowRecord } from './types';

export interface StatementSummary {
  currency: string;
  dateRange: { start: string; end: string } | null;
  income: number;
  expenses: number;
  /** Income minus spending, in minor currency units. Transfers are excluded. */
  netCashFlow: number;
  savings: number;
  categoryTotals: Array<{ categorySlug: string; amount: number; count: number }>;
  recurringCount: number;
  duplicateCount: number;
  unusualCount: number;
}

export function summarizeStatementRows(rows: readonly StatementRowRecord[]): StatementSummary {
  const included = rows.filter((row) => row.decision === 'include' && row.amount !== null);
  const categories = new Map<string, { amount: number; count: number }>();
  let income = 0;
  let expenses = 0;
  let savings = 0;
  for (const row of included) {
    const amount = row.amount!;
    if (isIncomeCategory(row.categorySlug) || amount > 0) income += Math.max(amount, 0);
    else if (getCategory(row.categorySlug)?.kind === 'expense') expenses += Math.max(-amount, 0);
    if (row.categorySlug === 'savings' || row.categorySlug === 'investments') savings += Math.abs(amount);
    const previous = categories.get(row.categorySlug) ?? { amount: 0, count: 0 };
    categories.set(row.categorySlug, { amount: previous.amount + Math.abs(amount), count: previous.count + 1 });
  }
  const dates = included.map((row) => row.postedAt).filter((value): value is string => value !== null).sort();
  const currency = included[0]?.currency ?? rows[0]?.currency ?? 'USD';
  return {
    currency,
    dateRange: dates.length ? { start: dates[0]!, end: dates[dates.length - 1]! } : null,
    income,
    expenses,
    netCashFlow: income - expenses,
    savings,
    categoryTotals: [...categories.entries()]
      .map(([categorySlug, value]) => ({ categorySlug, ...value, label: getCategory(categorySlug)?.name ?? 'Unknown' }))
      .sort((a, b) => b.amount - a.amount),
    recurringCount: included.filter((row) => row.isRecurring || row.flags.includes('recurring_payment')).length,
    duplicateCount: rows.filter((row) => row.flags.includes('possible_duplicate')).length,
    unusualCount: rows.filter((row) => row.flags.includes('unusual_spending')).length,
  };
}
