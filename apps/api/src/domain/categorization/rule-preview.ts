/**
 * Rule dry-runs.
 *
 * Firefly III's rule engine has one property worth copying above all others: it
 * can tell you what a rule *would* do before it does it. A categorization rule
 * applied blind across a ledger is one of the few actions in a finance app that
 * silently rewrites history at scale — and the user who wrote the pattern is
 * usually the person least able to predict its blast radius.
 *
 * Pure: takes a rule and transactions, returns what would change.
 */

import type { CategorizationRule, Transaction } from '../types';

export interface RuleChange {
  transactionId: string;
  postedAt: string;
  descriptor: string;
  amount: number;
  currency: string;
  fromCategorySlug: string;
  fromCategorySource: Transaction['categorySource'];
  toCategorySlug: string;
}

export interface RulePreview {
  /** Rows the rule matches and would change. */
  changes: RuleChange[];
  /** Matched but already in the target category — matching is not changing. */
  alreadyCorrect: number;
  /** Matched but protected because the user set the category by hand. */
  protectedByUserChoice: number;
  matched: number;
  /** True when the pattern matches nothing, which is usually a typo. */
  matchesNothing: boolean;
}

function matches(rule: CategorizationRule, normalized: string): boolean {
  switch (rule.matchType) {
    case 'exact':
      return normalized === rule.pattern.toLowerCase();
    case 'contains':
      return normalized.includes(rule.pattern.toLowerCase());
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(normalized);
      } catch {
        // A malformed pattern matches nothing rather than throwing, so the
        // preview can report "this matches nothing" instead of a 500.
        return false;
      }
  }
}

/**
 * What applying this rule would do.
 *
 * A transaction the user categorized by hand is counted but never changed. An
 * automatic rule silently overruling an explicit human decision is the single
 * behaviour most likely to make someone stop trusting the categorizer — and it
 * is invisible, because the rule looks like it simply worked.
 */
export function previewRule(
  rule: CategorizationRule,
  transactions: readonly Transaction[],
): RulePreview {
  const changes: RuleChange[] = [];
  let alreadyCorrect = 0;
  let protectedByUserChoice = 0;
  let matched = 0;

  for (const txn of transactions) {
    if (!matches(rule, txn.normalizedDescriptor)) continue;
    matched += 1;

    if (txn.categorySource === 'user_manual') {
      protectedByUserChoice += 1;
      continue;
    }

    if (txn.categorySlug === rule.categorySlug) {
      alreadyCorrect += 1;
      continue;
    }

    changes.push({
      transactionId: txn.id,
      postedAt: txn.postedAt,
      descriptor: txn.rawDescriptor,
      amount: txn.amount,
      currency: txn.currency,
      fromCategorySlug: txn.categorySlug,
      fromCategorySource: txn.categorySource,
      toCategorySlug: rule.categorySlug,
    });
  }

  return {
    changes,
    alreadyCorrect,
    protectedByUserChoice,
    matched,
    matchesNothing: matched === 0,
  };
}

export interface RulePatternCheck {
  ok: boolean;
  problems: string[];
}

export const MAX_PATTERN_LENGTH = 200;

/**
 * Validates a pattern before it is ever run.
 *
 * A user-supplied regex is executed against every descriptor in the ledger, so
 * an unbounded or catastrophically backtracking pattern is a denial of service
 * against the user's own account.
 */
export function checkRulePattern(matchType: string, pattern: string): RulePatternCheck {
  const problems: string[] = [];
  const trimmed = pattern.trim();

  if (trimmed.length === 0) problems.push('Enter a pattern to match.');
  if (trimmed.length > MAX_PATTERN_LENGTH) {
    problems.push(`Patterns must be ${MAX_PATTERN_LENGTH} characters or fewer.`);
  }

  if (!['contains', 'exact', 'regex'].includes(matchType)) {
    problems.push('matchType must be contains, exact, or regex.');
  }

  if (matchType === 'regex' && trimmed.length > 0) {
    try {
      new RegExp(trimmed);
    } catch {
      problems.push('That is not a valid regular expression.');
    }

    // Nested quantifiers are the classic catastrophic-backtracking shape. This
    // is a heuristic, not a proof, so it warns rather than silently allowing.
    if (/(\([^)]*[+*]\)[+*])|(\[[^\]]*\][+*]){2,}/.test(trimmed)) {
      problems.push(
        'That pattern may be extremely slow on a large ledger. Prefer a simpler one.',
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
