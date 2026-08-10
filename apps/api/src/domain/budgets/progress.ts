/**
 * Budget progress and threshold alerts.
 *
 * The mission specifies alerts at 50 / 75 / 90 / 100%. Getting a boundary
 * wrong here produces no error — just an alert that fires a day late, or not at
 * all. Hence the exhaustive tests in test/budgets.spec.ts.
 */

import { isSpendingCategory } from '../categories';
import { daysBetweenInclusive, isWithin } from '../dates';
import { percentOf } from '../money';
import type { Budget, DateRange, IsoDate, Transaction } from '../types';

export const THRESHOLDS = [50, 75, 90, 100] as const;
export type Threshold = (typeof THRESHOLDS)[number];

export type BudgetStatus = 'on_track' | 'warning' | 'critical' | 'exceeded';

export interface BudgetProgress {
  budgetId: string;
  categorySlug: string;
  currency: string;
  /** Positive, minor units. */
  limitAmount: number;
  /** Positive, minor units. Outflows only. */
  spentAmount: number;
  /** May be negative when the budget is blown. */
  remainingAmount: number;
  percentUsed: number;
  /** Highest threshold reached, or null below 50%. */
  thresholdCrossed: Threshold | null;
  status: BudgetStatus;
  daysElapsed: number;
  daysRemaining: number;
  /** Straight-line projection of period-end spend at the current pace. */
  projectedSpend: number;
  /** True when the projection blows the limit but actual spend has not yet. */
  projectedToExceed: boolean;
}

/** Highest threshold at or below `percent`. 49.9% -> null, 50% -> 50. */
export function thresholdFor(percent: number): Threshold | null {
  let crossed: Threshold | null = null;
  for (const t of THRESHOLDS) {
    if (percent >= t) crossed = t;
  }
  return crossed;
}

function statusFor(percent: number): BudgetStatus {
  if (percent >= 100) return 'exceeded';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'warning';
  return 'on_track';
}

/**
 * Spend against a budget for one period.
 *
 * Only outflows in *spending* categories count. Transfers are excluded
 * deliberately — moving $500 into savings is not spending, and counting it
 * would make every budget wrong. Refunds inside the period reduce spend, which
 * is why we sum signed amounts and negate rather than summing absolute values.
 */
export function spendForCategory(
  transactions: readonly Transaction[],
  categorySlug: string,
  period: DateRange,
  currency?: string,
): number {
  let net = 0;
  for (const txn of transactions) {
    if (txn.excludedFromAnalytics) continue;
    if (txn.categorySlug !== categorySlug) continue;
    if (currency && txn.currency !== currency) continue;
    if (!isWithin(txn.postedAt, period)) continue;
    if (!isSpendingCategory(txn.categorySlug)) continue;
    if (txn.pending) continue;
    net += txn.amount;
  }
  // net is <= 0 for normal spending. Report a positive figure, floored at 0 so
  // a category with net refunds shows as "spent nothing", not negative spend.
  return Math.max(0, -net);
}

export function computeBudgetProgress(
  budget: Budget,
  transactions: readonly Transaction[],
  period: DateRange,
  today: IsoDate,
): BudgetProgress {
  const spentAmount = spendForCategory(
    transactions,
    budget.categorySlug,
    period,
    budget.currency,
  );
  const percentUsed = percentOf(spentAmount, budget.limitAmount);

  const totalDays = daysBetweenInclusive(period.start, period.end);
  // Clamp so a period that has not started yet reports 0 elapsed rather than
  // a negative pace, and a finished period never exceeds its own length.
  const rawElapsed = daysBetweenInclusive(period.start, today < period.end ? today : period.end);
  const daysElapsed = Math.min(Math.max(rawElapsed, 0), totalDays);
  const daysRemaining = Math.max(totalDays - daysElapsed, 0);

  const projectedSpend =
    daysElapsed > 0 ? Math.round((spentAmount / daysElapsed) * totalDays) : 0;

  return {
    budgetId: budget.id,
    categorySlug: budget.categorySlug,
    currency: budget.currency,
    limitAmount: budget.limitAmount,
    spentAmount,
    remainingAmount: budget.limitAmount - spentAmount,
    percentUsed,
    thresholdCrossed: thresholdFor(percentUsed),
    status: statusFor(percentUsed),
    daysElapsed,
    daysRemaining,
    projectedSpend,
    projectedToExceed: projectedSpend > budget.limitAmount && spentAmount <= budget.limitAmount,
  };
}

export interface BudgetAlert {
  budgetId: string;
  categorySlug: string;
  threshold: Threshold | 'projection';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

/**
 * Alerts for a newly crossed threshold.
 *
 * `alreadyNotified` is the set of thresholds the user has already been told
 * about this period. Without it, every sync re-alerts an 80%-spent budget and
 * the user turns notifications off — at which point the 100% alert, the one
 * that mattered, never lands either.
 */
export function budgetAlerts(
  progress: BudgetProgress,
  alreadyNotified: ReadonlySet<number> = new Set(),
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const { thresholdCrossed } = progress;

  if (thresholdCrossed !== null && !alreadyNotified.has(thresholdCrossed)) {
    alerts.push({
      budgetId: progress.budgetId,
      categorySlug: progress.categorySlug,
      threshold: thresholdCrossed,
      severity:
        thresholdCrossed >= 100 ? 'critical' : thresholdCrossed >= 90 ? 'warning' : 'info',
      message:
        thresholdCrossed >= 100
          ? `You've gone over your ${progress.categorySlug} budget.`
          : `You've used ${thresholdCrossed}% of your ${progress.categorySlug} budget with ${progress.daysRemaining} days left.`,
    });
  }

  // A pace warning is only useful while there is still time to act on it.
  if (progress.projectedToExceed && progress.daysRemaining > 2 && !alreadyNotified.has(-1)) {
    alerts.push({
      budgetId: progress.budgetId,
      categorySlug: progress.categorySlug,
      threshold: 'projection',
      severity: 'warning',
      message: `At this pace you'll exceed your ${progress.categorySlug} budget before the period ends.`,
    });
  }

  return alerts;
}
