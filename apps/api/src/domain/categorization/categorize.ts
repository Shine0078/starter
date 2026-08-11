/**
 * The categorization pipeline. See ADR-0004.
 *
 *   1. user rules     deterministic, confidence 1.0, always wins
 *   2. merchant lexicon
 *   3. local learner  (explicit user corrections only)
 *   -> fallback       unknown, confidence 0
 *
 * Never guesses. A category we cannot justify is worse than no category,
 * because the user cannot tell the difference between a confident wrong answer
 * and a right one until their budget is already skewed.
 */

import type { CategorizationRule, CategorySource, RawTransaction } from '../types';
import { UNKNOWN_CATEGORY } from '../categories';
import { LEXICON_BY_SPECIFICITY, type LexiconEntry } from './lexicon';
import { normalizeDescriptor } from './normalize';

export interface CategorizationResult {
  categorySlug: string;
  source: CategorySource;
  confidence: number;
  merchant?: string;
  /** Human-readable justification. The mission requires every AI decision be
   *  explainable; this is what the UI shows behind "why this category?". */
  reason: string;
}

/** Below this, a model result is discarded in favour of `unknown`. */
export const MODEL_CONFIDENCE_FLOOR = 0.6;

export interface ModelPrediction {
  categorySlug: string;
  confidence: number;
  /** The learner's evidence, shown as part of the "why?" explanation. */
  reason?: string;
}

export interface ModelClassifier {
  classify(normalizedDescriptor: string): ModelPrediction | null;
}

export interface CategorizeOptions {
  rules?: readonly CategorizationRule[];
  lexicon?: readonly LexiconEntry[];
  model?: ModelClassifier;
}

function matchesRule(rule: CategorizationRule, normalized: string): boolean {
  switch (rule.matchType) {
    case 'exact':
      return normalized === rule.pattern.toLowerCase();
    case 'contains':
      return normalized.includes(rule.pattern.toLowerCase());
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(normalized);
      } catch {
        // A malformed user regex must not take down categorization for every
        // other transaction. Treat it as a non-match.
        return false;
      }
  }
}

export function categorizeDescriptor(
  rawDescriptor: string,
  options: CategorizeOptions = {},
): CategorizationResult {
  const normalized = normalizeDescriptor(rawDescriptor);
  const { rules = [], lexicon = LEXICON_BY_SPECIFICITY, model } = options;

  // --- Tier 1: user rules
  const matched = rules
    .filter((r) => matchesRule(r, normalized))
    .sort((a, b) => a.priority - b.priority);

  const winner = matched[0];
  if (winner) {
    return {
      categorySlug: winner.categorySlug,
      source: 'user_rule',
      confidence: 1,
      reason: `Your rule "${winner.pattern}" matches this transaction.`,
    };
  }

  // --- Tier 2: merchant lexicon
  for (const entry of lexicon) {
    if (normalized.includes(entry.match)) {
      return {
        categorySlug: entry.categorySlug,
        source: 'lexicon',
        confidence: entry.confidence,
        merchant: entry.merchant,
        reason: `Recognized "${entry.merchant}" from the merchant name.`,
      };
    }
  }

  // --- Tier 3: model
  if (model) {
    const prediction = model.classify(normalized);
    if (prediction && prediction.confidence >= MODEL_CONFIDENCE_FLOOR) {
      return {
        categorySlug: prediction.categorySlug,
        source: 'model',
        confidence: prediction.confidence,
        reason:
          prediction.reason ??
          `Predicted from similar transactions (${Math.round(prediction.confidence * 100)}% confident).`,
      };
    }
  }

  return {
    categorySlug: UNKNOWN_CATEGORY,
    source: 'unknown',
    confidence: 0,
    reason: 'No rule or known merchant matched. Categorize it and we will remember.',
  };
}

/**
 * Builds the tier-1 rule implied by a user correction.
 *
 * This is the mechanism behind the "never make the same mistake twice"
 * guarantee. Priority 0 puts user-generated rules ahead of any future
 * system-suggested ones.
 */
export function ruleFromCorrection(
  rawDescriptor: string,
  categorySlug: string,
  id: string,
): CategorizationRule {
  return {
    id,
    matchType: 'contains',
    pattern: normalizeDescriptor(rawDescriptor),
    categorySlug,
    priority: 0,
  };
}

/** Applies categorization to a batch, preserving input order. */
export function categorizeBatch(
  transactions: readonly RawTransaction[],
  options: CategorizeOptions = {},
): Map<string, CategorizationResult> {
  const results = new Map<string, CategorizationResult>();
  for (const txn of transactions) {
    results.set(txn.providerTxnId, categorizeDescriptor(txn.descriptor, options));
  }
  return results;
}

/** Share of transactions we could categorize. The headline accuracy proxy
 *  until there are enough corrections to measure real accuracy. */
export function coverageRate(results: Iterable<CategorizationResult>): number {
  let total = 0;
  let known = 0;
  for (const r of results) {
    total += 1;
    if (r.categorySlug !== UNKNOWN_CATEGORY) known += 1;
  }
  return total === 0 ? 0 : known / total;
}
