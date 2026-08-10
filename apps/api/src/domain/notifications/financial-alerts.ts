import { displayName, isSpendingCategory } from '../categories';
import { descriptorTokens } from '../categorization/normalize';
import { addDays, daysBetweenInclusive } from '../dates';
import { detectSubscriptions } from '../insights/subscriptions';
import { formatMoney, majorToMinor, money } from '../money';
import type { NotificationKind, Transaction } from '../types';

export interface DerivedFinancialAlert {
  kind: NotificationKind;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  dedupeKey: string;
}

const BILL_LOOKAHEAD_DAYS = 7;
const RECENT_UNUSUAL_DAYS = 14;
const BASELINE_DAYS = 180;
const MIN_BASELINE_TRANSACTIONS = 6;
const OUTLIER_MULTIPLIER = 3;
const MIN_OUTLIER_MAJOR_UNITS = 100;
const DUPLICATE_WINDOW_DAYS = 2;

/**
 * Alerts backed by recurring-series evidence. A bill is only described as
 * "expected", never certain: a merchant can change or cancel a charge after
 * the historical pattern was observed.
 */
export function deriveSubscriptionAlerts(
  transactions: readonly Transaction[],
  today: string,
): DerivedFinancialAlert[] {
  const alerts: DerivedFinancialAlert[] = [];

  for (const subscription of detectSubscriptions(transactions)) {
    const lastTransactionId = subscription.transactionIds.at(-1)!;

    if (subscription.priceIncrease) {
      const increase = subscription.priceIncrease;
      alerts.push({
        kind: 'subscription',
        title: 'Subscription price increase',
        message:
          `${subscription.merchant} increased from ` +
          `${formatMoney(money(increase.from, subscription.currency))} to ` +
          `${formatMoney(money(increase.to, subscription.currency))} ` +
          `(${Math.round(increase.percent)}% higher).`,
        severity: 'warning',
        dedupeKey:
          `subscription-price:${subscription.normalizedDescriptor}:` +
          `${increase.from}:${increase.to}`,
      });
    }

    if (
      subscription.nextExpected < today ||
      subscription.nextExpected > addDays(today, BILL_LOOKAHEAD_DAYS)
    ) {
      continue;
    }

    const daysUntil = daysBetweenInclusive(today, subscription.nextExpected) - 1;
    const when =
      daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
    alerts.push({
      kind: 'bill',
      title: 'Upcoming recurring charge',
      message:
        `${subscription.merchant} is expected ${when} for about ` +
        `${formatMoney(money(subscription.typicalAmount, subscription.currency))}. ` +
        'Check the date and amount before it posts.',
      severity: 'info',
      dedupeKey: `bill:${lastTransactionId}:${subscription.nextExpected}`,
    });
  }

  return alerts;
}

/**
 * Conservative transaction review alerts:
 *
 * - exact merchant/amount repeats within two days are possible duplicates;
 * - near-identical merchant descriptors with a near-identical amount are also
 *   reviewed, which catches bank formatting differences without declaring fraud;
 * - category outliers require six earlier observations, at least 3x the
 *   median, and at least 100 major currency units above that median.
 *
 * These are review prompts, not fraud declarations. Pending rows are excluded
 * because their amount or existence can still change.
 */
export function deriveUnusualTransactionAlerts(
  transactions: readonly Transaction[],
  today: string,
): DerivedFinancialAlert[] {
  const candidateStart = addDays(today, -RECENT_UNUSUAL_DAYS);
  const historyStart = addDays(candidateStart, -BASELINE_DAYS);
  const eligible = transactions
    .filter(
      (transaction) =>
        !transaction.pending &&
        transaction.amount < 0 &&
        transaction.postedAt >= historyStart &&
        transaction.postedAt <= today &&
        isSpendingCategory(transaction.categorySlug),
    )
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));

  const latestExact = new Map<string, Transaction>();
  const priorTransactions: Transaction[] = [];
  const categoryHistory = new Map<string, Transaction[]>();
  const alerts: DerivedFinancialAlert[] = [];

  for (const transaction of eligible) {
    const hasDescriptor = transaction.normalizedDescriptor.trim().length > 0;
    const exactKey = hasDescriptor
      ? [
          transaction.normalizedDescriptor,
          transaction.currency,
          Math.abs(transaction.amount),
        ].join('|')
      : null;
    const priorExact = exactKey ? latestExact.get(exactKey) : undefined;
    const isCandidate = transaction.postedAt >= candidateStart;
    let duplicateFound = false;
    let duplicateMatch: Transaction | undefined;

    if (isCandidate && priorExact) {
      const separation =
        daysBetweenInclusive(priorExact.postedAt, transaction.postedAt) - 1;
      if (separation <= DUPLICATE_WINDOW_DAYS) {
        const merchant = transaction.merchant ?? transaction.normalizedDescriptor;
        alerts.push({
          kind: 'unusual_transaction',
          title: 'Possible duplicate charge',
          message:
            `Two ${merchant} charges for ` +
            `${formatMoney(money(Math.abs(transaction.amount), transaction.currency))} ` +
            `posted within ${separation === 0 ? 'the same day' : `${separation} day${separation === 1 ? '' : 's'}`}. ` +
            'Review both transactions before disputing either charge.',
          severity: 'warning',
          dedupeKey: `possible-duplicate:${priorExact.id}:${transaction.id}`,
        });
        duplicateFound = true;
        duplicateMatch = priorExact;
      }
    }

    if (isCandidate && !duplicateFound) {
      duplicateMatch = [...priorTransactions].reverse().find((prior) => {
        if (prior.currency !== transaction.currency || prior.categorySlug !== transaction.categorySlug) {
          return false;
        }
        const separation = daysBetweenInclusive(prior.postedAt, transaction.postedAt) - 1;
        if (separation > DUPLICATE_WINDOW_DAYS) return false;
        const amountDifference = Math.abs(Math.abs(prior.amount) - Math.abs(transaction.amount));
        const amountTolerance = Math.max(100, Math.round(Math.abs(transaction.amount) * 0.01));
        return amountDifference <= amountTolerance && similarDescriptor(
          prior.normalizedDescriptor,
          transaction.normalizedDescriptor,
        );
      });
      if (duplicateMatch) {
        const separation = daysBetweenInclusive(duplicateMatch.postedAt, transaction.postedAt) - 1;
        const merchant = transaction.merchant ?? transaction.normalizedDescriptor;
        alerts.push({
          kind: 'unusual_transaction',
          title: 'Possible duplicate charge',
          message:
            `Two ${merchant} charges have similar merchant details and amounts ` +
            `within ${separation === 0 ? 'the same day' : `${separation} day${separation === 1 ? '' : 's'}`}. ` +
            'Review both transactions before disputing either charge.',
          severity: 'warning',
          dedupeKey: `possible-duplicate:${duplicateMatch.id}:${transaction.id}`,
        });
        duplicateFound = true;
      }
    }

    const categoryKey = `${transaction.categorySlug}|${transaction.currency}`;
    const priorCategory = categoryHistory.get(categoryKey) ?? [];
    const rollingStart = addDays(transaction.postedAt, -BASELINE_DAYS);
    const baseline = priorCategory.filter((row) => row.postedAt >= rollingStart);

    if (isCandidate && !duplicateFound && baseline.length >= MIN_BASELINE_TRANSACTIONS) {
      const medianAmount = median(baseline.map((row) => Math.abs(row.amount)));
      const candidateAmount = Math.abs(transaction.amount);
      const materialDifference = majorToMinor(
        MIN_OUTLIER_MAJOR_UNITS,
        transaction.currency,
      );
      if (
        medianAmount > 0 &&
        candidateAmount >= medianAmount * OUTLIER_MULTIPLIER &&
        candidateAmount - medianAmount >= materialDifference
      ) {
        const merchant =
          transaction.merchant ?? displayName(transaction.categorySlug);
        alerts.push({
          kind: 'unusual_transaction',
          title: 'Unusually large transaction',
          message:
            `${merchant} posted for ` +
            `${formatMoney(money(candidateAmount, transaction.currency))}, ` +
            `compared with a recent ${displayName(transaction.categorySlug).toLowerCase()} ` +
            `median of ${formatMoney(money(medianAmount, transaction.currency))}. Review the transaction if you do not recognize it.`,
          severity: 'warning',
          dedupeKey: `category-outlier:${transaction.id}`,
        });
      }
    }

    if (exactKey) latestExact.set(exactKey, transaction);
    priorTransactions.push(transaction);
    categoryHistory.set(categoryKey, [...baseline, transaction]);
  }

  return alerts;
}

function similarDescriptor(left: string, right: string): boolean {
  const leftTokens = new Set(descriptorTokens(left));
  const rightTokens = new Set(descriptorTokens(right));
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union >= 0.75;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}
