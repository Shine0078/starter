/**
 * Subscription detection.
 *
 * Subscriptions are *derived*, not declared. Asking users to enter their
 * subscriptions manually guarantees the list is incomplete — the ones people
 * forget are exactly the ones costing them money.
 *
 * Detection: group by normalized descriptor, then look for at least three
 * charges at a consistent interval and a consistent amount.
 */

import { isSpendingCategory } from '../categories';
import { addDays, addMonths, daysBetweenInclusive } from '../dates';
import type { Transaction } from '../types';

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface DetectedSubscription {
  merchant: string;
  normalizedDescriptor: string;
  categorySlug: string;
  cadence: Cadence;
  /** Median interval actually observed, in days. */
  observedIntervalDays: number;
  /** Median charge, positive minor units. */
  typicalAmount: number;
  currency: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** Projected next charge date. */
  nextExpected: string;
  /** Positive minor units. Charge normalized to a yearly figure. */
  annualCost: number;
  /** Set when the most recent charge is materially above the prior median. */
  priceIncrease: { from: number; to: number; percent: number } | null;
  transactionIds: string[];
  /** 0–1. How regular the intervals and amounts are. */
  confidence: number;
}

const CADENCE_WINDOWS: ReadonlyArray<{ cadence: Cadence; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'monthly', days: 30, tolerance: 5 },
  { cadence: 'quarterly', days: 91, tolerance: 10 },
  { cadence: 'yearly', days: 365, tolerance: 20 },
];

const MIN_OCCURRENCES = 3;
/** A charge can drift this much and still count as the same subscription. */
const AMOUNT_TOLERANCE = 0.15;
/**
 * Fraction of charges that must sit within AMOUNT_TOLERANCE of the median.
 *
 * A count-based check ("at least 3 near the median") is not enough: someone who
 * buys lunch thirty times a month will have three charges near the median by
 * chance, and a habit gets reported as a subscription. Requiring most charges
 * to cluster is what distinguishes a fixed recurring fee from a frequent habit.
 */
const MIN_AMOUNT_CONSISTENCY = 0.7;
/** Below this, the detection isn't strong enough to show a user. */
const MIN_CONFIDENCE = 0.6;
const PRICE_INCREASE_THRESHOLD = 0.05;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Every charge sits within tolerance of the segment's own median. */
function segmentConsistent(amounts: readonly number[]): boolean {
  if (amounts.length === 0) return false;
  const m = median(amounts);
  if (m <= 0) return false;
  return amounts.every((a) => Math.abs(a - m) / m <= AMOUNT_TOLERANCE);
}

interface AmountAnalysis {
  /** The *current* price, which is what a projection should use. */
  typicalAmount: number;
  consistency: number;
  priceIncrease: { from: number; to: number; percent: number } | null;
}

/**
 * Distinguishes three cases that a single "how much do the amounts vary"
 * number cannot:
 *
 *   - a stable subscription        -> consistent throughout
 *   - a subscription that got a raise -> two internally consistent segments
 *   - a spending habit             -> consistent nowhere
 *
 * Without the middle case, a strict consistency threshold silently drops every
 * subscription that ever changed price — which is exactly the set the user most
 * wants flagged.
 */
function analyzeAmounts(amountsByDate: readonly number[]): AmountAnalysis {
  const overallMedian = median(amountsByDate);
  const within =
    overallMedian > 0
      ? amountsByDate.filter((a) => Math.abs(a - overallMedian) / overallMedian <= AMOUNT_TOLERANCE)
      : [];
  const overallConsistency =
    amountsByDate.length > 0 ? within.length / amountsByDate.length : 0;

  // Step detection runs FIRST, before the overall-consistency shortcut.
  //
  // Two prices either side of a modest rise straddle their own median closely
  // enough to both look "consistent" — [15.49, 15.49, 17.99, 17.99] has a
  // median of 16.74 and every charge within 8% of it. Taking the shortcut there
  // hides the price rise and projects an annual cost at a price nobody pays.
  //
  // The split needs at least two charges at the old price to establish it; one
  // charge at the new price is enough to report.
  for (let i = 2; i <= amountsByDate.length - 1; i += 1) {
    const before = amountsByDate.slice(0, i);
    const after = amountsByDate.slice(i);
    if (!segmentConsistent(before) || !segmentConsistent(after)) continue;

    const from = median(before);
    const to = median(after);
    if (from <= 0) continue;

    const percent = ((to - from) / from) * 100;
    if (Math.abs(percent) < PRICE_INCREASE_THRESHOLD * 100) continue;

    return {
      typicalAmount: to,
      consistency: 1,
      priceIncrease: percent > 0 ? { from, to, percent } : null,
    };
  }

  // No step change: a flat series, or noise that no split can explain.
  return { typicalAmount: overallMedian, consistency: overallConsistency, priceIncrease: null };
}

function classifyCadence(intervalDays: number): { cadence: Cadence; fit: number } | null {
  for (const window of CADENCE_WINDOWS) {
    const drift = Math.abs(intervalDays - window.days);
    if (drift <= window.tolerance) {
      return { cadence: window.cadence, fit: 1 - drift / window.tolerance };
    }
  }
  return null;
}

const ANNUAL_MULTIPLIER: Readonly<Record<Cadence, number>> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/** Calendar months per cycle, for projecting the next charge date. */
const MONTHS_PER_CADENCE: Readonly<Record<Exclude<Cadence, 'weekly'>, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export function detectSubscriptions(
  transactions: readonly Transaction[],
): DetectedSubscription[] {
  const groups = new Map<string, Transaction[]>();

  for (const txn of transactions) {
    if (txn.pending) continue;
    if (txn.amount >= 0) continue; // subscriptions are outflows
    // A standing transfer into savings is recurring but it is not a cost, and
    // listing it under "what you're paying for" would be actively misleading.
    if (!isSpendingCategory(txn.categorySlug)) continue;
    const key = txn.normalizedDescriptor;
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(txn);
    else groups.set(key, [txn]);
  }

  const detected: DetectedSubscription[] = [];

  for (const [descriptor, rawGroup] of groups) {
    if (rawGroup.length < MIN_OCCURRENCES) continue;

    const group = [...rawGroup].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    const amounts = group.map((t) => Math.abs(t.amount));

    // Reject groups whose amounts vary too much — a coffee shop visited weekly
    // is a habit, not a subscription, and its amounts wander.
    const { typicalAmount, consistency: amountConsistency, priceIncrease } = analyzeAmounts(amounts);
    if (typicalAmount === 0) continue;
    if (amountConsistency < MIN_AMOUNT_CONSISTENCY) continue;

    const intervals: number[] = [];
    for (let i = 1; i < group.length; i += 1) {
      intervals.push(daysBetweenInclusive(group[i - 1]!.postedAt, group[i]!.postedAt) - 1);
    }
    const observedIntervalDays = median(intervals);
    const classified = classifyCadence(observedIntervalDays);
    if (!classified) continue;

    // Regularity: how tightly the intervals cluster around their median.
    const drift =
      intervals.reduce((sum, i) => sum + Math.abs(i - observedIntervalDays), 0) /
      Math.max(intervals.length, 1);
    const regularity = Math.max(0, 1 - drift / Math.max(observedIntervalDays, 1));
    const confidence = Math.min(
      1,
      0.4 * classified.fit + 0.3 * regularity + 0.3 * amountConsistency,
    );
    if (confidence < MIN_CONFIDENCE) continue;

    const last = group[group.length - 1]!;
    const first = group[0]!;

    // Monthly and longer cadences are projected in calendar months, not in
    // days. A subscription billed on the 31st should next fall on the 31st;
    // adding a median day count drifts it earlier every short month.
    const nextExpected =
      classified.cadence === 'weekly'
        ? addDays(last.postedAt, observedIntervalDays)
        : addMonths(last.postedAt, MONTHS_PER_CADENCE[classified.cadence]);

    detected.push({
      merchant: last.merchant ?? descriptor,
      normalizedDescriptor: descriptor,
      categorySlug: last.categorySlug,
      cadence: classified.cadence,
      observedIntervalDays,
      typicalAmount,
      currency: last.currency,
      occurrences: group.length,
      firstSeen: first.postedAt,
      lastSeen: last.postedAt,
      nextExpected,
      annualCost: typicalAmount * ANNUAL_MULTIPLIER[classified.cadence],
      priceIncrease,
      transactionIds: group.map((t) => t.id),
      confidence,
    });
  }

  return detected.sort((a, b) => b.annualCost - a.annualCost);
}

/** Total yearly outlay across detected subscriptions. */
export function totalAnnualSubscriptionCost(subs: readonly DetectedSubscription[]): number {
  return subs.reduce((sum, s) => sum + s.annualCost, 0);
}

/**
 * Subscriptions with no charge well past their expected date — usually a
 * cancelled service we should stop counting, occasionally a failed payment
 * the user would want to know about.
 */
export function staleSubscriptions(
  subs: readonly DetectedSubscription[],
  today: string,
): DetectedSubscription[] {
  return subs.filter((s) => {
    const overdueDays = daysBetweenInclusive(s.nextExpected, today) - 1;
    return overdueDays > Math.max(7, s.observedIntervalDays * 0.5);
  });
}
