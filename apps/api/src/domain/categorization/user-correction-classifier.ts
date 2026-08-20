/**
 * A deliberately small, local learning model built from a person's own
 * explicit category corrections.  It is not a remote/third-party AI service:
 * descriptors never leave the transaction store and it produces no prediction
 * unless it can point to a very similar correction.
 *
 * This is a nearest-neighbour classifier rather than a black box.  That is
 * appropriate for the small amount of labelled data a new finance user has,
 * and keeps the decision reproducible and explainable.  User rules and the
 * curated merchant lexicon still run first in `categorizeDescriptor`.
 */

import type { Transaction } from '../types';
import type { ModelClassifier, ModelPrediction } from './categorize';
import { descriptorTokens, normalizeDescriptor } from './normalize';

const MAX_CORRECTIONS = 300;
const MIN_SHARED_TOKENS_FOR_FUZZY_MATCH = 3;
const MIN_SMALLER_SET_OVERLAP = 0.8;
const MIN_JACCARD_FOR_FUZZY_MATCH = 0.65;
const MIN_CATEGORY_MARGIN = 0.15;

interface CorrectionExample {
  normalizedDescriptor: string;
  categorySlug: string;
  tokens: ReadonlySet<string>;
}

interface ScoredExample extends CorrectionExample {
  score: number;
  exact: boolean;
}

/**
 * Learns only `user_manual` choices.  Rules are intentionally excluded:
 * choosing "apply to similar transactions" already creates a deterministic
 * tier-one rule, so treating it as model training would add no value and
 * could hide the provenance of the result.
 */
export class UserCorrectionClassifier implements ModelClassifier {
  private constructor(private readonly examples: readonly CorrectionExample[]) {}

  static fromTransactions(transactions: readonly Transaction[]): UserCorrectionClassifier {
    const categoriesByDescriptor = new Map<string, Set<string>>();

    for (const transaction of transactions) {
      if (transaction.categorySource !== 'user_manual') continue;
      const normalized = transaction.normalizedDescriptor || normalizeDescriptor(transaction.rawDescriptor);
      if (descriptorTokens(normalized).length === 0) continue;
      const categories = categoriesByDescriptor.get(normalized) ?? new Set<string>();
      categories.add(transaction.categorySlug);
      categoriesByDescriptor.set(normalized, categories);
    }

    // Conflicting manual labels for one normalized merchant are ambiguous.  A
    // safe learner ignores them instead of arbitrarily choosing the latest
    // correction and silently repeating a disputed categorization.
    const examples: CorrectionExample[] = [];
    for (const transaction of transactions) {
      if (transaction.categorySource !== 'user_manual') continue;
      const normalized = transaction.normalizedDescriptor || normalizeDescriptor(transaction.rawDescriptor);
      const categories = categoriesByDescriptor.get(normalized);
      if (!categories || categories.size !== 1 || descriptorTokens(normalized).length === 0) continue;
      if (examples.some((example) => example.normalizedDescriptor === normalized)) continue;
      examples.push({
        normalizedDescriptor: normalized,
        categorySlug: transaction.categorySlug,
        tokens: new Set(descriptorTokens(normalized)),
      });
      if (examples.length === MAX_CORRECTIONS) break;
    }

    return new UserCorrectionClassifier(examples);
  }

  /**
   * Leave-one-out evaluation over this user's own unambiguous corrections.
   * This is not held-out real-world accuracy and must not be quoted as such.
   */
  static evaluateLeaveOneOut(transactions: readonly Transaction[]): {
    labelled: number;
    predicted: number;
    correct: number;
    abstained: number;
    top1Accuracy: number | null;
    coverage: number;
  } {
    const labelled = UserCorrectionClassifier.fromTransactions(transactions).examples;
    if (labelled.length < 2) {
      return {
        labelled: labelled.length,
        predicted: 0,
        correct: 0,
        abstained: labelled.length,
        top1Accuracy: null,
        coverage: 0,
      };
    }

    let predicted = 0;
    let correct = 0;
    for (let i = 0; i < labelled.length; i += 1) {
      const heldOut = labelled[i]!;
      const trainer = new UserCorrectionClassifier(labelled.filter((_, index) => index !== i));
      const guess = trainer.classify(heldOut.normalizedDescriptor);
      if (!guess) continue;
      predicted += 1;
      if (guess.categorySlug === heldOut.categorySlug) correct += 1;
    }

    return {
      labelled: labelled.length,
      predicted,
      correct,
      abstained: labelled.length - predicted,
      top1Accuracy: predicted === 0 ? null : correct / predicted,
      coverage: predicted / labelled.length,
    };
  }

  classify(normalizedDescriptor: string): ModelPrediction | null {
    const normalized = normalizeDescriptor(normalizedDescriptor);
    const tokens = new Set(descriptorTokens(normalized));
    if (tokens.size === 0 || this.examples.length === 0) return null;

    const candidates = this.examples
      .map((example): ScoredExample | null => {
        if (example.normalizedDescriptor === normalized) {
          return { ...example, score: 1, exact: true };
        }

        let shared = 0;
        for (const token of tokens) {
          if (example.tokens.has(token)) shared += 1;
        }
        const smallerSetOverlap = shared / Math.min(tokens.size, example.tokens.size);
        const jaccard = shared / (tokens.size + example.tokens.size - shared);
        if (
          shared < MIN_SHARED_TOKENS_FOR_FUZZY_MATCH ||
          smallerSetOverlap < MIN_SMALLER_SET_OVERLAP ||
          jaccard < MIN_JACCARD_FOR_FUZZY_MATCH
        ) {
          return null;
        }
        // Jaccard rewards an exact merchant signature; the smaller-set
        // overlap permits a harmless extra location word without lowering an
        // otherwise unambiguous correction below the threshold.
        return { ...example, score: 0.65 * jaccard + 0.35 * smallerSetOverlap, exact: false };
      })
      .filter((candidate): candidate is ScoredExample => candidate !== null)
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best) return null;
    const runnerUpForAnotherCategory = candidates.find(
      (candidate) => candidate.categorySlug !== best.categorySlug,
    );
    if (
      runnerUpForAnotherCategory &&
      best.score - runnerUpForAnotherCategory.score < MIN_CATEGORY_MARGIN
    ) {
      return null;
    }

    const confidence = best.exact ? 0.98 : Math.min(0.94, 0.6 + best.score * 0.34);
    return {
      categorySlug: best.categorySlug,
      confidence,
      reason: best.exact
        ? 'Matches your earlier correction for this merchant.'
        : 'Matches a very similar merchant you categorised earlier.',
    };
  }
}
