import { describe, expect, it } from 'vitest';

import { findDuplicate, reviewImport } from '../src/domain/imports/review';
import type { ColumnMapping } from '../src/domain/imports/mapping';
import type { Transaction } from '../src/domain/types';

const HEADERS = ['Date', 'Description', 'Amount'];

const MAPPING: ColumnMapping = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  convention: 'signed',
  dateOrder: 'YMD',
};

let counter = 0;
function existing(overrides: Partial<Transaction> = {}): Transaction {
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
    categorySlug: 'coffee',
    categorySource: 'lexicon',
    categoryConfidence: 0.9,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

describe('findDuplicate', () => {
  const candidate = { postedAt: '2026-03-01', amount: -450, normalizedDescriptor: 'blue bottle' };

  it('matches the same day, amount, and description', () => {
    const match = findDuplicate(candidate, [existing()]);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(1);
  });

  it('never matches a different amount', () => {
    // However similar the text, a different amount is a different transaction.
    expect(findDuplicate(candidate, [existing({ amount: -451 })])).toBeNull();
  });

  it('tolerates a small date shift', () => {
    // A CSV export and the provider feed often disagree by a day or two.
    expect(findDuplicate(candidate, [existing({ postedAt: '2026-03-02' })])).not.toBeNull();
  });

  it('ignores a match far outside the date window', () => {
    expect(findDuplicate(candidate, [existing({ postedAt: '2026-04-01' })])).toBeNull();
  });

  it('still matches when the bank reformatted the descriptor', () => {
    // Requiring an exact descriptor match would let every re-import duplicate
    // the ledger, since banks rewrite these between exports.
    const match = findDuplicate(candidate, [
      existing({ normalizedDescriptor: 'blue bottle coffee co' }),
    ]);
    expect(match).not.toBeNull();
  });

  it('does not match an unrelated descriptor on a different day', () => {
    expect(
      findDuplicate(candidate, [
        existing({ postedAt: '2026-03-03', normalizedDescriptor: 'shell oil' }),
      ]),
    ).toBeNull();
  });

  it('is empty-safe', () => {
    expect(findDuplicate(candidate, [])).toBeNull();
  });
});

describe('reviewImport', () => {
  const run = (rows: string[][], existingRows: Transaction[] = [], overrides = {}) =>
    reviewImport({ headers: HEADERS, rows, mapping: MAPPING, existing: existingRows, ...overrides });

  it('accepts a clean row', () => {
    const review = run([['2026-03-01', 'Coffee', '-4.50']]);

    expect(review.rows[0]?.decision).toBe('import');
    expect(review.rows[0]?.amount).toBe(-450);
    expect(review.summary.importable).toBe(1);
  });

  it('points at the real line number in the file', () => {
    // Line 1 is the header, so the first data row is line 2.
    const review = run([['bad', 'Coffee', '-4.50']]);
    expect(review.rows[0]?.line).toBe(2);
  });

  it('flags rather than drops an unreadable date', () => {
    const review = run([['not a date', 'Coffee', '-4.50']]);
    expect(review.rows[0]?.decision).toBe('invalid');
    expect(review.rows[0]?.reason).toMatch(/date/i);
    expect(review.rows).toHaveLength(1);
  });

  it('flags an unreadable amount', () => {
    const review = run([['2026-03-01', 'Coffee', 'n/a']]);
    expect(review.rows[0]?.decision).toBe('invalid');
    expect(review.rows[0]?.reason).toMatch(/amount/i);
  });

  it('flags a zero amount', () => {
    // Almost always a balance line or a repeated header, not a transaction.
    const review = run([['2026-03-01', 'Balance brought forward', '0.00']]);
    expect(review.rows[0]?.decision).toBe('invalid');
  });

  it('flags an empty description', () => {
    const review = run([['2026-03-01', '', '-4.50']]);
    expect(review.rows[0]?.decision).toBe('invalid');
  });

  it('marks a ragged row without re-checking it', () => {
    const review = run([['2026-03-01', 'Coffee']], [], { raggedLines: [2] });
    expect(review.rows[0]?.decision).toBe('invalid');
    expect(review.rows[0]?.reason).toMatch(/columns/i);
  });

  it('detects a duplicate of something already held', () => {
    const review = run([['2026-03-01', 'SQ *BLUE BOTTLE 0093', '-4.50']], [existing()]);

    expect(review.rows[0]?.decision).toBe('duplicate');
    expect(review.rows[0]?.duplicateOfId).toBeTruthy();
    expect(review.rows[0]?.duplicateConfidence).toBeGreaterThan(0.8);
  });

  it('detects the same transaction appearing twice in one file', () => {
    const review = run([
      ['2026-03-01', 'Coffee shop', '-4.50'],
      ['2026-03-01', 'Coffee shop', '-4.50'],
    ]);

    expect(review.rows[0]?.decision).toBe('import');
    expect(review.rows[1]?.decision).toBe('duplicate');
  });

  it('does not treat two genuinely different amounts as duplicates', () => {
    const review = run([
      ['2026-03-01', 'Coffee shop', '-4.50'],
      ['2026-03-01', 'Coffee shop', '-5.50'],
    ]);

    expect(review.rows.every((r) => r.decision === 'import')).toBe(true);
  });

  it('summarises the batch', () => {
    const review = run(
      [
        ['2026-03-01', 'Coffee', '-4.50'],
        ['2026-03-05', 'Salary', '2000.00'],
        ['bad', 'Broken', '-1.00'],
      ],
      [],
    );

    expect(review.summary).toMatchObject({
      total: 3,
      importable: 2,
      invalid: 1,
      netAmount: 199_550,
    });
    expect(review.summary.dateRange).toEqual({ start: '2026-03-01', end: '2026-03-05' });
  });

  it('reports no date range when nothing is importable', () => {
    expect(run([['bad', 'x', 'y']]).summary.dateRange).toBeNull();
  });

  it('never silently discards a row', () => {
    // Every input row must appear in the output, whatever its decision.
    const rows = [
      ['2026-03-01', 'Coffee', '-4.50'],
      ['bad', '', ''],
      ['2026-03-02', 'Lunch', 'n/a'],
    ];
    expect(run(rows).rows).toHaveLength(rows.length);
  });

  describe('debit/credit columns', () => {
    const mapping: ColumnMapping = {
      date: 'Date',
      description: 'Description',
      debit: 'Debit',
      credit: 'Credit',
      convention: 'debit_credit_columns',
      dateOrder: 'YMD',
    };

    const headers = ['Date', 'Description', 'Debit', 'Credit'];
    const runPair = (rows: string[][]) =>
      reviewImport({ headers, rows, mapping, existing: [] });

    it('reads a debit as an outflow', () => {
      expect(runPair([['2026-03-01', 'Coffee', '4.50', '']]).rows[0]?.amount).toBe(-450);
    });

    it('reads a credit as an inflow', () => {
      expect(runPair([['2026-03-01', 'Salary', '', '2000.00']]).rows[0]?.amount).toBe(200_000);
    });

    it('rejects a row with both sides filled', () => {
      // A transaction cannot be both; that is a malformed export.
      expect(runPair([['2026-03-01', 'Odd', '4.50', '2.00']]).rows[0]?.decision).toBe('invalid');
    });

    it('rejects a row with neither side filled', () => {
      expect(runPair([['2026-03-01', 'Empty', '', '']]).rows[0]?.decision).toBe('invalid');
    });
  });

  describe('positive amount with a direction column', () => {
    const mapping: ColumnMapping = {
      date: 'Date',
      description: 'Description',
      amount: 'Amount',
      direction: 'Type',
      convention: 'positive_with_direction',
      dateOrder: 'YMD',
    };

    const headers = ['Date', 'Description', 'Amount', 'Type'];
    const runDirected = (rows: string[][]) =>
      reviewImport({ headers, rows, mapping, existing: [] });

    it.each([
      ['Debit', -450],
      ['DR', -450],
      ['Withdrawal', -450],
      ['Credit', 450],
      ['Deposit', 450],
    ])('reads %s correctly', (direction, expected) => {
      expect(runDirected([['2026-03-01', 'Item', '4.50', direction]]).rows[0]?.amount).toBe(expected);
    });

    it('rejects an unrecognised direction rather than assuming', () => {
      expect(runDirected([['2026-03-01', 'Item', '4.50', 'wat']]).rows[0]?.decision).toBe('invalid');
    });
  });
});
