import { addDays, addMonths, daysBetweenInclusive, isWithin, startOfMonth, weekRange } from '../dates';
import { displayName, isEssentialCategory, isIncomeCategory, isSpendingCategory } from '../categories';
import { matchRefunds, type RefundMatch } from '../transactions/refund-matching';
import type { DateRange, Transaction } from '../types';

export interface AnalyticsTotal {
  key: string;
  total: number;
  count: number;
}

export interface TimelineEvent {
  id: string;
  date: string;
  label: string;
  kind: 'income' | 'refund' | 'expense' | 'bill' | 'subscription' | 'transfer' | 'unusual';
  amount: number;
  accountId: string;
}

export interface SpendingVelocity {
  currentPeriodSpend: number;
  projectedPeriodSpend: number;
  historicalAverageSpend: number | null;
  percentDelta: number | null;
  enoughHistory: boolean;
}

/** One deliberately small chart series: money in versus money out. */
export interface AnalyticsTrendPoint {
  /** The start of the calendar bucket represented by this point. */
  date: string;
  income: number;
  expenses: number;
  refunds: number;
  /** Income + refunds - expenses, never mixing currencies. */
  net: number;
}

export interface AnalyticsReport {
  period: DateRange;
  currency: string;
  grossExpenses: number;
  refunds: number;
  refundMatches: RefundMatch[];
  netExpenses: number;
  expenseCount: number;
  averageExpense: number;
  medianExpense: number;
  largestExpense: TimelineEvent | null;
  spendingByCategory: AnalyticsTotal[];
  spendingByMerchant: AnalyticsTotal[];
  spendingByAccount: AnalyticsTotal[];
  recurringSpending: number;
  discretionarySpending: number;
  essentialSpending: number;
  totalIncome: number;
  recurringIncome: number;
  irregularIncome: number;
  incomeBySource: AnalyticsTotal[];
  savings: number;
  savingsRate: number;
  averageMonthlySavings: number;
  velocity: SpendingVelocity;
  trend: AnalyticsTrendPoint[];
  timeline: TimelineEvent[];
}

interface Totals {
  total: number;
  count: number;
}

function addTotal(map: Map<string, Totals>, key: string, amount: number): void {
  const existing = map.get(key) ?? { total: 0, count: 0 };
  map.set(key, { total: existing.total + amount, count: existing.count + 1 });
}

function sortedTotals(map: Map<string, Totals>): AnalyticsTotal[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function expenseAmount(transaction: Transaction): number {
  return Math.max(0, -transaction.amount);
}

function eventKind(transaction: Transaction): TimelineEvent['kind'] {
  if (transaction.categorySlug === 'refunds' && transaction.amount > 0) return 'refund';
  if (isIncomeCategory(transaction.categorySlug) && transaction.amount > 0) return 'income';
  if (transaction.categorySlug === 'transfer' || transaction.categorySlug === 'savings' || transaction.categorySlug === 'investments') {
    return 'transfer';
  }
  if (transaction.isRecurring) {
    return transaction.categorySlug === 'subscriptions' || transaction.categorySlug === 'software'
      ? 'subscription'
      : 'bill';
  }
  return transaction.categorySource === 'unknown' ? 'unusual' : 'expense';
}

function toEvent(transaction: Transaction): TimelineEvent {
  return {
    id: transaction.id,
    date: transaction.postedAt,
    label: transaction.merchant ?? transaction.normalizedDescriptor,
    kind: eventKind(transaction),
    amount: transaction.amount,
    accountId: transaction.accountId,
  };
}

type TrendBucket = 'day' | 'week' | 'month';

function trendBucket(period: DateRange): TrendBucket {
  const days = daysBetweenInclusive(period.start, period.end);
  if (days <= 62) return 'day';
  if (days <= 370) return 'week';
  return 'month';
}

function trendBucketStart(date: string, bucket: TrendBucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'week') return weekRange(date as DateRange['start']).start;
  return startOfMonth(date as DateRange['start']);
}

function nextTrendBucket(date: string, bucket: TrendBucket): string {
  if (bucket === 'day') return addDays(date as DateRange['start'], 1);
  if (bucket === 'week') return addDays(date as DateRange['start'], 7);
  return addMonths(date as DateRange['start'], 1);
}

function emptyTrendPoint(date: string): AnalyticsTrendPoint {
  return { date, income: 0, expenses: 0, refunds: 0, net: 0 };
}

/**
 * Builds a complete, gap-filled series so a chart never joins two distant
 * transactions as if the days between them did not exist. Long ranges are
 * intentionally downsampled to weeks/months to keep the visual readable.
 */
function buildTrend(
  rows: readonly Transaction[],
  period: DateRange,
): AnalyticsTrendPoint[] {
  const bucket = trendBucket(period);
  const points = new Map<string, AnalyticsTrendPoint>();
  let date = trendBucketStart(period.start, bucket);
  const end = trendBucketStart(period.end, bucket);
  while (date <= end) {
    points.set(date, emptyTrendPoint(date));
    date = nextTrendBucket(date, bucket);
  }

  for (const transaction of rows) {
    const key = trendBucketStart(transaction.postedAt, bucket);
    const point = points.get(key) ?? emptyTrendPoint(key);
    if (isIncomeCategory(transaction.categorySlug) && transaction.amount > 0 && transaction.categorySlug !== 'refunds') {
      point.income += transaction.amount;
    } else if (transaction.categorySlug === 'refunds' && transaction.amount > 0) {
      point.refunds += transaction.amount;
    } else if (isSpendingCategory(transaction.categorySlug) && transaction.amount < 0) {
      point.expenses += expenseAmount(transaction);
    }
    point.net = point.income + point.refunds - point.expenses;
    points.set(key, point);
  }

  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Server-side analytics for a selected period. All money remains integer minor
 * units and only rows in the requested currency are included, so the API never
 * silently adds CAD to USD. Refunds are kept out of income and reduce net
 * expenses instead.
 */
export function computeAnalytics(
  transactions: readonly Transaction[],
  period: DateRange,
  currency: string,
  asOf = period.end,
): AnalyticsReport {
  const rows = transactions.filter(
    (transaction) =>
      transaction.currency === currency &&
      !transaction.pending &&
      !transaction.excludedFromAnalytics &&
      isWithin(transaction.postedAt, period),
  );
  const spending = rows.filter(
    (transaction) => isSpendingCategory(transaction.categorySlug) && transaction.amount < 0,
  );
  const incomes = rows.filter(
    (transaction) =>
      isIncomeCategory(transaction.categorySlug) &&
      transaction.amount > 0 &&
      transaction.categorySlug !== 'refunds',
  );
  const refundRows = rows.filter(
    (transaction) => transaction.categorySlug === 'refunds' && transaction.amount > 0,
  );
  const refundIds = new Set(refundRows.map((transaction) => transaction.id));
  const refundMatches = matchRefunds(transactions).filter((match) => refundIds.has(match.refundId));

  const byCategory = new Map<string, Totals>();
  const byMerchant = new Map<string, Totals>();
  const byAccount = new Map<string, Totals>();
  const incomeBySource = new Map<string, Totals>();
  const expenseAmounts: number[] = [];
  const timeline = rows.map(toEvent).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  let essentialSpending = 0;
  let discretionarySpending = 0;
  let recurringSpending = 0;
  let totalIncome = 0;
  let recurringIncome = 0;

  for (const transaction of spending) {
    const amount = expenseAmount(transaction);
    expenseAmounts.push(amount);
    addTotal(byCategory, transaction.categorySlug, amount);
    addTotal(byMerchant, transaction.merchant ?? transaction.normalizedDescriptor, amount);
    addTotal(byAccount, transaction.accountId, amount);
    if (transaction.isRecurring) recurringSpending += amount;
    if (isEssentialCategory(transaction.categorySlug)) essentialSpending += amount;
    else discretionarySpending += amount;
  }
  for (const transaction of incomes) {
    totalIncome += transaction.amount;
    if (transaction.isRecurring) recurringIncome += transaction.amount;
    addTotal(incomeBySource, transaction.merchant ?? displayName(transaction.categorySlug), transaction.amount);
  }

  expenseAmounts.sort((a, b) => a - b);
  const grossExpenses = expenseAmounts.reduce((sum, amount) => sum + amount, 0);
  const refunds = refundRows.reduce((sum, transaction) => sum + transaction.amount, 0);
  const netExpenses = Math.max(0, grossExpenses - refunds);
  const savings = totalIncome - netExpenses;
  const medianExpense = expenseAmounts.length === 0
    ? 0
    : expenseAmounts.length % 2 === 1
        ? expenseAmounts[Math.floor((expenseAmounts.length - 1) / 2)]!
        : Math.round((expenseAmounts[Math.floor(expenseAmounts.length / 2) - 1]! + expenseAmounts[Math.floor(expenseAmounts.length / 2)]!) / 2);
  const largest = spending.reduce<Transaction | null>(
    (current, transaction) => current === null || expenseAmount(transaction) > expenseAmount(current) ? transaction : current,
    null,
  );

  const periodDays = daysBetweenInclusive(period.start, period.end);
  const elapsedEnd = asOf < period.end ? asOf : period.end;
  const elapsedDays = asOf < period.start ? 0 : daysBetweenInclusive(period.start, elapsedEnd);
  const projected = elapsedDays > 0 && elapsedDays < periodDays
    ? Math.round(grossExpenses / elapsedDays * periodDays)
    : grossExpenses;

  const historyStart = addDays(period.start, -90);
  const historyEnd = addDays(period.start, -1);
  const historyRows = transactions.filter(
    (transaction) =>
      transaction.currency === currency &&
      !transaction.pending &&
      !transaction.excludedFromAnalytics &&
      isWithin(transaction.postedAt, { start: historyStart, end: historyEnd }) &&
      isSpendingCategory(transaction.categorySlug) &&
      transaction.amount < 0,
  );
  const historicalTotal = historyRows.reduce((sum, transaction) => sum + expenseAmount(transaction), 0);
  const historicalAverageSpend = historyRows.length === 0
    ? null
    : Math.round(historicalTotal / 90 * periodDays);
  const percentDelta = historicalAverageSpend === null || historicalAverageSpend === 0
    ? null
    : Math.round((projected - historicalAverageSpend) / historicalAverageSpend * 1000) / 10;

  const monthlySavings = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.currency !== currency || transaction.pending || transaction.excludedFromAnalytics) continue;
    if (!isWithin(transaction.postedAt, period)) continue;
    const month = transaction.postedAt.slice(0, 7);
    const eligibleIncome = isIncomeCategory(transaction.categorySlug) && transaction.categorySlug !== 'refunds' && transaction.amount > 0
      ? transaction.amount
      : 0;
    const eligibleExpense = isSpendingCategory(transaction.categorySlug) && transaction.amount < 0
      ? expenseAmount(transaction)
      : 0;
    const eligibleRefund = transaction.categorySlug === 'refunds' && transaction.amount > 0
      ? transaction.amount
      : 0;
    monthlySavings.set(month, (monthlySavings.get(month) ?? 0) + eligibleIncome - eligibleExpense + eligibleRefund);
  }
  const averageMonthlySavings = monthlySavings.size === 0
    ? 0
    : Math.round([...monthlySavings.values()].reduce((sum, value) => sum + value, 0) / monthlySavings.size);

  return {
    period,
    currency,
    grossExpenses,
    refunds,
    refundMatches,
    netExpenses,
    expenseCount: spending.length,
    averageExpense: spending.length === 0 ? 0 : Math.round(grossExpenses / spending.length),
    medianExpense,
    largestExpense: largest ? toEvent(largest) : null,
    spendingByCategory: sortedTotals(byCategory),
    spendingByMerchant: sortedTotals(byMerchant),
    spendingByAccount: sortedTotals(byAccount),
    recurringSpending,
    discretionarySpending,
    essentialSpending,
    totalIncome,
    recurringIncome,
    irregularIncome: totalIncome - recurringIncome,
    incomeBySource: sortedTotals(incomeBySource),
    savings,
    savingsRate: totalIncome > 0 ? Math.max(0, savings / totalIncome * 100) : 0,
    averageMonthlySavings,
    velocity: {
      currentPeriodSpend: grossExpenses,
      projectedPeriodSpend: projected,
      historicalAverageSpend,
      percentDelta,
      enoughHistory: historyRows.length >= 3,
    },
    trend: buildTrend(rows, period),
    timeline: timeline.slice(0, 200),
  };
}
