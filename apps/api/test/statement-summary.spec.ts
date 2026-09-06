import { describe, expect, it } from 'vitest';

import { summarizeStatementRows } from '../src/domain/statement-import/summary';
import type { StatementRowRecord } from '../src/domain/statement-import/types';

function row(partial: Partial<StatementRowRecord>): StatementRowRecord {
  return {
    id: 'row', importId: 'import', sourceLine: 1, postedAt: '2026-03-01', description: 'row',
    merchant: null, amount: -100, currency: 'USD', direction: 'debit', categorySlug: 'groceries',
    categorySource: 'lexicon', categoryConfidence: 0.9, isRecurring: false, flags: [], decision: 'include',
    fingerprint: 'a'.repeat(64), raw: 'row', editedAt: null, ...partial,
  };
}

describe('statement summaries', () => {
  it('excludes rejected rows and separates income, expenses, savings, and flags', () => {
    const summary = summarizeStatementRows([
      row({ amount: -100, categorySlug: 'groceries', flags: ['recurring_payment'] }),
      row({ amount: 500, categorySlug: 'salary', direction: 'credit' }),
      row({ amount: -50, categorySlug: 'savings', flags: ['unusual_spending'] }),
      row({ amount: -20, decision: 'needs_review', flags: ['possible_duplicate'] }),
    ]);
    expect(summary.income).toBe(500);
    expect(summary.expenses).toBe(100);
    expect(summary.netCashFlow).toBe(400);
    expect(summary.savings).toBe(50);
    expect(summary.recurringCount).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.unusualCount).toBe(1);
  });
});
