import { describe, expect, it } from 'vitest';

import { checkRulePattern, previewRule } from '../src/domain/categorization/rule-preview';
import type { CategorizationRule, Transaction } from '../src/domain/types';

let counter = 0;
function txn(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1;
  return {
    id: `t${counter}`,
    accountId: 'acc',
    providerTxnId: `p${counter}`,
    postedAt: '2026-03-01',
    amount: -450,
    currency: 'USD',
    rawDescriptor: 'SQ *BLUE BOTTLE 0093',
    normalizedDescriptor: 'blue bottle',
    categorySlug: 'unknown',
    categorySource: 'unknown',
    categoryConfidence: 0,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

const rule = (overrides: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: 'r1',
  matchType: 'contains',
  pattern: 'blue bottle',
  categorySlug: 'coffee',
  priority: 0,
  ...overrides,
});

describe('previewRule', () => {
  it('lists what would change, with the before and after', () => {
    const preview = previewRule(rule(), [txn()]);

    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]).toMatchObject({
      fromCategorySlug: 'unknown',
      toCategorySlug: 'coffee',
    });
  });

  it('writes nothing — the input is untouched', () => {
    const rows = [txn()];
    const snapshot = JSON.stringify(rows);

    previewRule(rule(), rows);

    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it('counts a match that is already in the target category as no change', () => {
    // Matching is not changing; reporting it as a change overstates the impact.
    const preview = previewRule(rule(), [txn({ categorySlug: 'coffee' })]);

    expect(preview.matched).toBe(1);
    expect(preview.alreadyCorrect).toBe(1);
    expect(preview.changes).toHaveLength(0);
  });

  it('never overrules a category the user set by hand', () => {
    // An automatic rule silently overriding an explicit human decision is the
    // fastest way to make someone stop trusting the categorizer.
    const preview = previewRule(
      rule(),
      [txn({ categorySlug: 'groceries', categorySource: 'user_manual' })],
    );

    expect(preview.matched).toBe(1);
    expect(preview.protectedByUserChoice).toBe(1);
    expect(preview.changes).toHaveLength(0);
  });

  it('does change a row categorized by another rule', () => {
    const preview = previewRule(
      rule(),
      [txn({ categorySlug: 'groceries', categorySource: 'user_rule' })],
    );
    expect(preview.changes).toHaveLength(1);
  });

  it('flags a pattern that matches nothing', () => {
    // Usually a typo, and silently doing nothing looks identical to success.
    const preview = previewRule(rule({ pattern: 'nothing matches this' }), [txn()]);

    expect(preview.matchesNothing).toBe(true);
    expect(preview.changes).toHaveLength(0);
  });

  it('supports exact and regex matching', () => {
    expect(previewRule(rule({ matchType: 'exact', pattern: 'blue bottle' }), [txn()]).matched).toBe(1);
    expect(previewRule(rule({ matchType: 'exact', pattern: 'blue' }), [txn()]).matched).toBe(0);
    expect(previewRule(rule({ matchType: 'regex', pattern: '^blue\\s+bottle$' }), [txn()]).matched).toBe(1);
  });

  it('treats a malformed regex as matching nothing rather than throwing', () => {
    const preview = previewRule(rule({ matchType: 'regex', pattern: '([unclosed' }), [txn()]);
    expect(preview.matchesNothing).toBe(true);
  });

  it('is empty-safe', () => {
    expect(previewRule(rule(), []).matchesNothing).toBe(true);
  });

  it('scales its report across many rows', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => txn()),
      ...Array.from({ length: 2 }, () => txn({ categorySlug: 'coffee' })),
      ...Array.from({ length: 3 }, () => txn({ categorySource: 'user_manual' })),
      txn({ normalizedDescriptor: 'shell oil' }),
    ];

    const preview = previewRule(rule(), rows);

    expect(preview.matched).toBe(10);
    expect(preview.changes).toHaveLength(5);
    expect(preview.alreadyCorrect).toBe(2);
    expect(preview.protectedByUserChoice).toBe(3);
  });
});

describe('checkRulePattern', () => {
  it('accepts a plain substring', () => {
    expect(checkRulePattern('contains', 'blue bottle').ok).toBe(true);
  });

  it('rejects an empty pattern', () => {
    expect(checkRulePattern('contains', '   ').ok).toBe(false);
  });

  it('rejects an overlong pattern', () => {
    expect(checkRulePattern('contains', 'a'.repeat(201)).ok).toBe(false);
  });

  it('rejects an unknown match type', () => {
    expect(checkRulePattern('vibes', 'x').ok).toBe(false);
  });

  it('rejects an invalid regex', () => {
    const result = checkRulePattern('regex', '([unclosed');
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/regular expression/i);
  });

  it('warns about a catastrophically backtracking pattern', () => {
    // Run against every descriptor in the ledger, so this is a denial of
    // service against the user's own account.
    const result = checkRulePattern('regex', '(a+)+$');
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/slow/i);
  });

  it('accepts a reasonable regex', () => {
    expect(checkRulePattern('regex', '^(uber|lyft)').ok).toBe(true);
  });
});
