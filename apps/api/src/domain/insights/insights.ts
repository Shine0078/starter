/**
 * Derived observations about spending.
 *
 * Every insight carries the transaction ids that produced it. The mission
 * requires AI features be explainable, and an insight the user cannot drill
 * into is one they cannot trust — especially when it contradicts their memory.
 */

import { displayName, isIncomeCategory, isSpendingCategory } from '../categories';
import { daysBetweenInclusive, isWithin } from '../dates';
import { formatMoney, money, percentOf } from '../money';
import type { DateRange, Transaction } from '../types';

export interface CategoryTotal {
  categorySlug: string;
  categoryName: string;
  /** Positive minor units. */
  total: number;
  transactionCount: number;
}

export interface PeriodSummary {
  period: DateRange;
  currency: string;
  /** Positive minor units. */
  income: number;
  /** Positive minor units. */
  expenses: number;
  /** income - expenses. Negative means the user spent more than they earned. */
  netCashFlow: number;
  /** 0–100. Negative is clamped away; a negative "rate" reads as nonsense. */
  savingsRate: number;
  topCategories: CategoryTotal[];
  topMerchant: { merchant: string; total: number; count: number } | null;
  largestTransaction: Transaction | null;
  mostExpensiveDay: { date: string; total: number } | null;
  averageDailySpend: number;
  transactionCount: number;
}

function settled(transactions: readonly Transaction[], period: DateRange): Transaction[] {
  return transactions.filter(
    (t) => !t.pending && !t.excludedFromAnalytics && isWithin(t.postedAt, period),
  );
}

export function summarizePeriod(
  transactions: readonly Transaction[],
  period: DateRange,
  currency: string,
): PeriodSummary {
  const rows = settled(transactions, period);

  let income = 0;
  let expenses = 0;
  const byCategory = new Map<string, { total: number; count: number }>();
  const byMerchant = new Map<string, { total: number; count: number }>();
  const byDay = new Map<string, number>();
  let largest: Transaction | null = null;

  for (const txn of rows) {
    if (isIncomeCategory(txn.categorySlug) && txn.amount > 0) {
      income += txn.amount;
      continue;
    }
    if (!isSpendingCategory(txn.categorySlug)) continue; // transfers excluded

    const outflow = Math.max(0, -txn.amount);
    if (outflow === 0) continue;

    expenses += outflow;

    const cat = byCategory.get(txn.categorySlug) ?? { total: 0, count: 0 };
    byCategory.set(txn.categorySlug, { total: cat.total + outflow, count: cat.count + 1 });

    const key = txn.merchant ?? txn.normalizedDescriptor;
    const merch = byMerchant.get(key) ?? { total: 0, count: 0 };
    byMerchant.set(key, { total: merch.total + outflow, count: merch.count + 1 });

    byDay.set(txn.postedAt, (byDay.get(txn.postedAt) ?? 0) + outflow);

    if (!largest || outflow > Math.max(0, -largest.amount)) largest = txn;
  }

  const topCategories: CategoryTotal[] = [...byCategory.entries()]
    .map(([slug, v]) => ({
      categorySlug: slug,
      categoryName: displayName(slug),
      total: v.total,
      transactionCount: v.count,
    }))
    .sort((a, b) => b.total - a.total);

  const topMerchantEntry = [...byMerchant.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  const topDayEntry = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  const days = daysBetweenInclusive(period.start, period.end);
  const netCashFlow = income - expenses;

  return {
    period,
    currency,
    income,
    expenses,
    netCashFlow,
    savingsRate: income > 0 ? Math.max(0, percentOf(netCashFlow, income)) : 0,
    topCategories,
    topMerchant: topMerchantEntry
      ? { merchant: topMerchantEntry[0], total: topMerchantEntry[1].total, count: topMerchantEntry[1].count }
      : null,
    largestTransaction: largest,
    mostExpensiveDay: topDayEntry ? { date: topDayEntry[0], total: topDayEntry[1] } : null,
    averageDailySpend: days > 0 ? Math.round(expenses / days) : 0,
    transactionCount: rows.length,
  };
}

export type InsightKind =
  | 'category_increase'
  | 'category_decrease'
  | 'new_recurring_charge'
  | 'price_increase'
  | 'overspending'
  | 'positive_trend';

export interface Insight {
  kind: InsightKind;
  severity: 'info' | 'warning' | 'positive';
  title: string;
  detail: string;
  categorySlug?: string;
  /** Minor units, signed: positive means "more spent than before". */
  deltaAmount?: number;
  deltaPercent?: number;
  /** The transactions behind this insight. Non-negotiable — see the file header. */
  evidenceTransactionIds: string[];
}

/** Ignore swings on trivial amounts. A 300% increase on a $2 category is noise. */
const MATERIALITY_FLOOR = 2_000; // $20.00
const SIGNIFICANT_CHANGE_PCT = 15;

/**
 * Month-over-month comparison, largest movements first.
 *
 * A category present in one period and absent from the other is handled: the
 * missing side is zero, which is the honest comparison rather than a skip.
 */
export function compareCategoryTotals(
  current: PeriodSummary,
  previous: PeriodSummary,
  transactions: readonly Transaction[],
): Insight[] {
  const prevBySlug = new Map(previous.topCategories.map((c) => [c.categorySlug, c.total]));
  const currBySlug = new Map(current.topCategories.map((c) => [c.categorySlug, c.total]));
  const slugs = new Set([...prevBySlug.keys(), ...currBySlug.keys()]);

  const insights: Insight[] = [];

  for (const slug of slugs) {
    const now = currBySlug.get(slug) ?? 0;
    const before = prevBySlug.get(slug) ?? 0;
    const delta = now - before;

    if (Math.abs(delta) < MATERIALITY_FLOOR) continue;

    const pct = before === 0 ? 100 : percentOf(delta, before);
    if (Math.abs(pct) < SIGNIFICANT_CHANGE_PCT) continue;

    const evidence = transactions
      .filter((t) => t.categorySlug === slug && isWithin(t.postedAt, current.period) && !t.pending)
      .map((t) => t.id);

    const name = displayName(slug);
    const magnitude = formatMoney(money(Math.abs(delta), current.currency));

    insights.push(
      delta > 0
        ? {
            kind: 'category_increase',
            severity: 'warning',
            title: `${name} spending is up ${Math.round(Math.abs(pct))}%`,
            detail: `You spent ${magnitude} more on ${name} than last period.`,
            categorySlug: slug,
            deltaAmount: delta,
            deltaPercent: pct,
            evidenceTransactionIds: evidence,
          }
        : {
            kind: 'category_decrease',
            severity: 'positive',
            title: `${name} spending is down ${Math.round(Math.abs(pct))}%`,
            detail: `You spent ${magnitude} less on ${name} than last period.`,
            categorySlug: slug,
            deltaAmount: delta,
            deltaPercent: pct,
            evidenceTransactionIds: evidence,
          },
    );
  }

  return insights.sort((a, b) => Math.abs(b.deltaAmount ?? 0) - Math.abs(a.deltaAmount ?? 0));
}

/** Cash-flow warning. Fires only when the shortfall is material. */
export function cashFlowInsight(summary: PeriodSummary): Insight | null {
  if (summary.netCashFlow >= 0 || summary.income === 0) return null;
  const shortfall = Math.abs(summary.netCashFlow);
  if (shortfall < MATERIALITY_FLOOR) return null;

  return {
    kind: 'overspending',
    severity: 'warning',
    title: 'You spent more than you earned',
    detail: `Expenses exceeded income by ${formatMoney(money(shortfall, summary.currency))} this period.`,
    deltaAmount: -shortfall,
    evidenceTransactionIds: [],
  };
}
