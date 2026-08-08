/**
 * A deliberately conservative cash-flow forecast.
 *
 * We project only income and bills with a repeatable history.  Guessing that a
 * typical coffee or grocery spend will repeat makes a forecast look precise
 * while being less useful than an honest lower-bound.  Forecast points are
 * therefore explained by the recurring transactions that produced them.
 */

import { isIncomeCategory } from '../categories';
import { addDays, addMonths, daysBetweenInclusive } from '../dates';
import type { Account, Transaction } from '../types';
import { type Cadence, detectSubscriptions } from './subscriptions';

export interface ForecastEvent {
  date: string;
  /** Positive for income, negative for an expected bill. Minor units. */
  amount: number;
  merchant: string;
  kind: 'income' | 'expense';
  confidence: number;
  transactionIds: string[];
}

export interface ForecastPoint {
  date: string;
  /** Projected liquid cash after all events on this date. Minor units. */
  balance: number;
}

export interface CashFlowForecast {
  asOf: string;
  currency: string;
  startingBalance: number;
  points: ForecastPoint[];
  events: ForecastEvent[];
  /** Dates on which liquid cash is projected to fall below zero. */
  lowBalanceDates: string[];
}

type IncomeCadence = Cadence | 'biweekly' | 'semimonthly';

interface RecurringIncome {
  merchant: string;
  amount: number;
  cadence: IncomeCadence;
  intervalDays: number;
  lastSeen: string;
  confidence: number;
  transactionIds: string[];
}

const INCOME_WINDOWS: ReadonlyArray<{ cadence: Exclude<IncomeCadence, 'semimonthly'>; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 2 },
  { cadence: 'monthly', days: 30, tolerance: 5 },
  { cadence: 'quarterly', days: 91, tolerance: 10 },
  { cadence: 'yearly', days: 365, tolerance: 20 },
];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function incomeCadenceFor(intervalDays: number): { cadence: Exclude<IncomeCadence, 'semimonthly'>; fit: number } | null {
  for (const window of INCOME_WINDOWS) {
    const difference = Math.abs(intervalDays - window.days);
    if (difference <= window.tolerance) {
      return { cadence: window.cadence, fit: 1 - difference / window.tolerance };
    }
  }
  return null;
}

function nextOccurrence(lastSeen: string, cadence: Cadence | IncomeCadence, intervalDays: number): string {
  if (cadence === 'weekly' || cadence === 'biweekly') return addDays(lastSeen, intervalDays);
  if (cadence === 'semimonthly') {
    // Two payrolls per month are calendar events, not "every 15 days". Adding
    // days makes February pay arrive on the wrong date and drifts the outlook.
    const day = Number(lastSeen.slice(8, 10));
    if (day <= 7) return `${lastSeen.slice(0, 8)}15`;
    return `${addMonths(lastSeen.slice(0, 8) + '01', 1).slice(0, 8)}01`;
  }
  const months = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
  return addMonths(lastSeen, months);
}

/**
 * Finds stable positive deposits such as salary.  This is intentionally more
 * selective than income categorization: a refund or one-off bonus must never
 * be shown as money the user can rely on receiving again.
 */
export function detectRecurringIncome(transactions: readonly Transaction[]): RecurringIncome[] {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.pending || transaction.amount <= 0 || !isIncomeCategory(transaction.categorySlug)) continue;
    const rows = groups.get(transaction.normalizedDescriptor) ?? [];
    rows.push(transaction);
    groups.set(transaction.normalizedDescriptor, rows);
  }

  const recurring: RecurringIncome[] = [];
  for (const [descriptor, rows] of groups) {
    if (rows.length < 3) continue;
    const sorted = [...rows].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    const amounts = sorted.map((row) => row.amount);
    const typicalAmount = median(amounts);
    if (typicalAmount <= 0) continue;

    const amountConsistency = amounts.filter((amount) => Math.abs(amount - typicalAmount) / typicalAmount <= 0.15).length /
      amounts.length;
    if (amountConsistency < 0.7) continue;

    const intervals = sorted.slice(1).map((row, index) =>
      daysBetweenInclusive(sorted[index]!.postedAt, row.postedAt) - 1,
    );
    const intervalDays = median(intervals);
    const payDays = sorted.map((row) => Number(row.postedAt.slice(8, 10)));
    const looksSemimonthly = payDays.every((day) => Math.abs(day - 1) <= 1 || Math.abs(day - 15) <= 1);
    const cadence = looksSemimonthly
      ? { cadence: 'semimonthly' as const, fit: 1 }
      : incomeCadenceFor(intervalDays);
    if (!cadence) continue;

    const averageDrift = intervals.reduce((sum, interval) => sum + Math.abs(interval - intervalDays), 0) /
      intervals.length;
    const regularity = Math.max(0, 1 - averageDrift / Math.max(intervalDays, 1));
    const confidence = 0.4 * cadence.fit + 0.3 * amountConsistency + 0.3 * regularity;
    if (confidence < 0.6) continue;

    const last = sorted[sorted.length - 1]!;
    recurring.push({
      merchant: last.merchant ?? descriptor,
      amount: typicalAmount,
      cadence: cadence.cadence,
      intervalDays,
      lastSeen: last.postedAt,
      confidence,
      transactionIds: sorted.map((row) => row.id),
    });
  }

  return recurring;
}

/**
 * Builds one point per calendar day.  Only checking, savings, and cash are
 * spendable; including a credit limit would turn debt into imaginary cash.
 */
export function forecastCashFlow(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: string,
  days: number,
  currency = 'USD',
): CashFlowForecast {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('Forecast days must be an integer from 1 through 90');
  }

  const startingBalance = accounts
    .filter((account) => account.currency === currency)
    .filter((account) => account.type === 'checking' || account.type === 'savings' || account.type === 'cash')
    .reduce((sum, account) => sum + account.balanceCurrent, 0);
  const end = addDays(asOf, days);
  const events: ForecastEvent[] = [];

  for (const income of detectRecurringIncome(transactions)) {
    let date = nextOccurrence(income.lastSeen, income.cadence, income.intervalDays);
    while (date <= asOf) date = nextOccurrence(date, income.cadence, income.intervalDays);
    while (date <= end) {
      events.push({ ...income, date, kind: 'income' });
      date = nextOccurrence(date, income.cadence, income.intervalDays);
    }
  }

  for (const bill of detectSubscriptions(transactions)) {
    let date = bill.nextExpected;
    while (date <= asOf) date = nextOccurrence(date, bill.cadence, bill.observedIntervalDays);
    while (date <= end) {
      events.push({
        date,
        amount: -bill.typicalAmount,
        merchant: bill.merchant,
        kind: 'expense',
        confidence: bill.confidence,
        transactionIds: bill.transactionIds,
      });
      date = nextOccurrence(date, bill.cadence, bill.observedIntervalDays);
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const eventsByDate = new Map<string, number>();
  for (const event of events) {
    eventsByDate.set(event.date, (eventsByDate.get(event.date) ?? 0) + event.amount);
  }

  const points: ForecastPoint[] = [];
  const lowBalanceDates: string[] = [];
  let balance = startingBalance;
  for (let offset = 1; offset <= days; offset += 1) {
    const date = addDays(asOf, offset);
    balance += eventsByDate.get(date) ?? 0;
    points.push({ date, balance });
    if (balance < 0) lowBalanceDates.push(date);
  }

  return { asOf, currency, startingBalance, points, events, lowBalanceDates };
}
