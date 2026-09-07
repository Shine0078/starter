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
  it('uses the detected statement currency when no rows were extracted', () => {
    expect(summarizeStatementRows([], 'CAD').currency).toBe('CAD');
  });

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

  it('does not treat positive card payments or transfers as income', () => {
    const summary = summarizeStatementRows([
      row({ amount: 98995, direction: 'credit', categorySlug: 'credit_card_payment' }),
      row({ amount: 50000, direction: 'credit', categorySlug: 'transfer' }),
      row({ amount: 250000, direction: 'credit', categorySlug: 'salary' }),
    ]);
    expect(summary.income).toBe(250000);
    expect(summary.expenses).toBe(0);
    expect(summary.netCashFlow).toBe(250000);
  });
});
