import { isSpendingCategory } from '../categories';
import { daysBetweenInclusive } from '../dates';
import { descriptorTokens } from '../categorization/normalize';
import type { Transaction } from '../types';

export interface RefundMatch {
  refundId: string;
  purchaseId: string;
  amount: number;
  purchaseAmount: number;
  currency: string;
  merchant: string;
  purchaseDate: string;
  refundDate: string;
  daysAfterPurchase: number;
  confidence: number;
}

const MAX_REFUND_DAYS = 120;

/**
 * Pair posted refunds with the most plausible earlier purchase. Matching is
 * deliberately conservative: the rows must share an account and currency,
 * the refund cannot exceed the purchase, and the descriptors must contain
 * the same merchant evidence. One purchase is never used twice.
 */
export function matchRefunds(transactions: readonly Transaction[]): RefundMatch[] {
  const purchases = transactions.filter(
    (transaction) =>
      !transaction.pending &&
      transaction.amount < 0 &&
      isSpendingCategory(transaction.categorySlug),
  );
  const refunds = transactions
    .filter(
      (transaction) =>
        !transaction.pending &&
        transaction.categorySlug === 'refunds' &&
        transaction.amount > 0,
    )
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  const usedPurchases = new Set<string>();
  const matches: RefundMatch[] = [];

  for (const refund of refunds) {
    const candidates = purchases
      .filter((purchase) => {
        if (usedPurchases.has(purchase.id)) return false;
        if (purchase.accountId !== refund.accountId || purchase.currency !== refund.currency) return false;
        if (purchase.postedAt > refund.postedAt) return false;
        const daysAfter = daysBetweenInclusive(purchase.postedAt, refund.postedAt) - 1;
        if (daysAfter > MAX_REFUND_DAYS) return false;
        return refund.amount <= Math.abs(purchase.amount) && descriptorSimilarity(
          purchase.normalizedDescriptor,
          refund.normalizedDescriptor,
          purchase.merchant,
          refund.merchant,
        ) > 0;
      })
      .map((purchase) => scoreCandidate(purchase, refund))
      .sort((a, b) => b.score - a.score || a.daysAfter - b.daysAfter || a.purchase.id.localeCompare(b.purchase.id));

    const best = candidates[0];
    if (!best) continue;
    usedPurchases.add(best.purchase.id);
    matches.push({
      refundId: refund.id,
      purchaseId: best.purchase.id,
      amount: refund.amount,
      purchaseAmount: Math.abs(best.purchase.amount),
      currency: refund.currency,
      merchant: refund.merchant ?? refund.normalizedDescriptor,
      purchaseDate: best.purchase.postedAt,
      refundDate: refund.postedAt,
      daysAfterPurchase: best.daysAfter,
      confidence: Math.round(Math.min(0.99, best.score / 10) * 100) / 100,
    });
  }

  return matches;
}

function scoreCandidate(purchase: Transaction, refund: Transaction): {
  purchase: Transaction;
  daysAfter: number;
  score: number;
} {
  const daysAfter = daysBetweenInclusive(purchase.postedAt, refund.postedAt) - 1;
  const similarity = descriptorSimilarity(
    purchase.normalizedDescriptor,
    refund.normalizedDescriptor,
    purchase.merchant,
    refund.merchant,
  );
  const amountRatio = refund.amount / Math.abs(purchase.amount);
  return {
    purchase,
    daysAfter,
    // Descriptor evidence dominates; amount and timing break ties. A partial
    // refund is valid, while an over-refund is excluded before scoring.
    score: similarity * 6 + amountRatio * 3 + (1 - daysAfter / MAX_REFUND_DAYS),
  };
}

function descriptorSimilarity(
  leftDescriptor: string,
  rightDescriptor: string,
  leftMerchant?: string,
  rightMerchant?: string,
): number {
  const left = new Set(descriptorTokens(leftDescriptor));
  const right = new Set(descriptorTokens(rightDescriptor));
  const leftMerchantTokens = new Set(descriptorTokens(leftMerchant ?? ''));
  const rightMerchantTokens = new Set(descriptorTokens(rightMerchant ?? ''));
  const descriptorScore = jaccard(left, right);
  const merchantScore = jaccard(leftMerchantTokens, rightMerchantTokens);
  return Math.max(descriptorScore, merchantScore);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}
