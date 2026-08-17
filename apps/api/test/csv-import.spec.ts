import { describe, expect, it } from 'vitest';

import { CsvParseError, detectDelimiter, parseCsv } from '../src/domain/imports/csv-parse';
import {
  detectDateOrder,
  parseAmount,
  parseDate,
  suggestMapping,
} from '../src/domain/imports/mapping';

describe('detectDelimiter', () => {
  it('finds a comma', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('finds a semicolon in a European export', () => {
    expect(detectDelimiter('Datum;Beschreibung;Betrag\n01.03.2026;Kaffee;-4,50')).toBe(';');
  });

  it('finds a tab', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('prefers the delimiter that splits consistently, not the most frequent', () => {
    // Counting commas on the header alone picks wrongly here: the descriptions
    // contain commas but the file is semicolon-separated.
    const text = 'Date;Description;Amount\n2026-03-01;Coffee, large;-4.50\n2026-03-02;Lunch, out;-12.00';
    expect(detectDelimiter(text)).toBe(';');
  });
});

describe('parseCsv', () => {
  it('reads headers and rows', () => {
    const parsed = parseCsv('Date,Description,Amount\n2026-03-01,Coffee,-4.50');
    expect(parsed.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(parsed.rows).toEqual([['2026-03-01', 'Coffee', '-4.50']]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    // A surviving BOM makes an exact match on "Date" fail invisibly.
    const parsed = parseCsv('﻿Date,Amount\n2026-03-01,-4.50');
    expect(parsed.headers[0]).toBe('Date');
  });

  it('handles CRLF line endings', () => {
    const parsed = parseCsv('Date,Amount\r\n2026-03-01,-4.50\r\n');
    expect(parsed.rows).toHaveLength(1);
  });

  it('keeps a quoted delimiter inside the field', () => {
    const parsed = parseCsv('Date,Description\n2026-03-01,"Coffee, large"');
    expect(parsed.rows[0]).toEqual(['2026-03-01', 'Coffee, large']);
  });

  it('unescapes a doubled quote', () => {
    const parsed = parseCsv('Date,Description\n2026-03-01,"He said ""hi"""');
    expect(parsed.rows[0]?.[1]).toBe('He said "hi"');
  });

  it('keeps a newline inside a quoted field as one row', () => {
    // Splitting naively on \n turns one transaction into two malformed ones.
    const parsed = parseCsv('Date,Description\n2026-03-01,"Line one\nLine two"');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.[1]).toContain('Line one');
  });

  it('reports ragged rows instead of dropping them', () => {
    // Silently discarding rows from a bank export is how money goes missing.
    const parsed = parseCsv('Date,Description,Amount\n2026-03-01,Coffee\n2026-03-02,Lunch,-1.00');
    expect(parsed.raggedLines).toEqual([2]);
    expect(parsed.rows).toHaveLength(2);
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv('   ')).toThrow(CsvParseError);
  });

  it('rejects a file with a single column', () => {
    expect(() => parseCsv('JustOneColumn\nvalue')).toThrow(CsvParseError);
  });

  it('rejects a file beyond the row limit', () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => `2026-03-01,Row ${i},-1.00`).join('\n');
    expect(() => parseCsv(`Date,Description,Amount\n${rows}`)).toThrow(/limit is 10000/);
  });
});

describe('detectDateOrder', () => {
  it('recognises ISO dates', () => {
    const result = detectDateOrder(['2026-03-01', '2026-04-02']);
    expect(result.order).toBe('YMD');
    expect(result.ambiguous).toBe(false);
  });

  it('proves day-first when the first position exceeds 12', () => {
    const result = detectDateOrder(['13/03/2026', '01/04/2026']);
    expect(result.order).toBe('DMY');
    expect(result.ambiguous).toBe(false);
  });

  it('proves month-first when the second position exceeds 12', () => {
    const result = detectDateOrder(['03/13/2026', '04/01/2026']);
    expect(result.order).toBe('MDY');
    expect(result.ambiguous).toBe(false);
  });

  it('admits ambiguity rather than guessing', () => {
    // 03/04/2026 is 3 April or 4 March. Guessing moves transactions by months.
    const result = detectDateOrder(['03/04/2026', '05/06/2026']);
    expect(result.ambiguous).toBe(true);
  });

  it('flags a file that contradicts itself', () => {
    const result = detectDateOrder(['13/01/2026', '01/13/2026']);
    expect(result.ambiguous).toBe(true);
  });

  it('is empty-safe', () => {
    expect(detectDateOrder([]).ambiguous).toBe(true);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-03-01', 'YMD', '2026-03-01'],
    ['01/03/2026', 'DMY', '2026-03-01'],
    ['03/01/2026', 'MDY', '2026-03-01'],
    ['1.3.2026', 'DMY', '2026-03-01'],
    ['01-03-26', 'DMY', '2026-03-01'],
  ])('%s as %s -> %s', (input, order, expected) => {
    expect(parseDate(input, order as 'DMY' | 'MDY' | 'YMD')).toBe(expected);
  });

  it('rejects a day the month does not have', () => {
    // Date would roll 31 February forward to 3 March rather than failing.
    expect(parseDate('31/02/2026', 'DMY')).toBeNull();
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseDate('29/02/2028', 'DMY')).toBe('2028-02-29');
  });

  it('rejects 29 February in a common year', () => {
    expect(parseDate('29/02/2026', 'DMY')).toBeNull();
  });

  it('returns null for a non-date', () => {
    expect(parseDate('not a date', 'DMY')).toBeNull();
    expect(parseDate('', 'DMY')).toBeNull();
  });
});

describe('parseAmount', () => {
  it.each([
    ['-4.50', -450],
    ['4.50', 450],
    ['1,234.56', 123_456],
    ['$1,234.56', 123_456],
    ['1.234,56', 123_456],
    ['-1.234,56', -123_456],
    ['(1,234.56)', -123_456],
    ['1,23', 123],
    ['1,234', 123_400],
    ['0', 0],
    ['0.00', 0],
  ])('%s -> %s minor units', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('returns null rather than zero for unreadable input', () => {
    // A silent zero is a transaction that vanishes from the totals.
    expect(parseAmount('n/a')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('--')).toBeNull();
  });

  it('handles a currency with no minor unit', () => {
    expect(parseAmount('1500', 'JPY')).toBe(1500);
  });
});

describe('suggestMapping', () => {
  it('recognises a typical bank export', () => {
    const result = suggestMapping(
      ['Date', 'Description', 'Amount'],
      [['2026-03-01', 'Coffee', '-4.50']],
    );

    expect(result.mapping?.date).toBe('Date');
    expect(result.mapping?.description).toBe('Description');
    expect(result.mapping?.convention).toBe('signed');
    expect(result.mapping?.dateOrder).toBe('YMD');
  });

  it('recognises a debit/credit pair', () => {
    const result = suggestMapping(
      ['Transaction Date', 'Narrative', 'Debit', 'Credit'],
      [['01/03/2026', 'Coffee', '4.50', '']],
    );

    expect(result.mapping?.convention).toBe('debit_credit_columns');
    expect(result.mapping?.debit).toBe('Debit');
    expect(result.mapping?.credit).toBe('Credit');
  });

  it('prefers an exact header match over a substring', () => {
    const result = suggestMapping(
      ['Date Posted', 'Date', 'Description', 'Amount'],
      [['2026-03-01', '2026-03-02', 'Coffee', '-4.50']],
    );
    expect(result.mapping?.date).toBe('Date');
  });

  it('returns no mapping rather than a partial guess', () => {
    // A half-mapped import produces rows that look right.
    const result = suggestMapping(['Foo', 'Bar'], [['1', '2']]);
    expect(result.mapping).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns when the date order cannot be proven', () => {
    const result = suggestMapping(
      ['Date', 'Description', 'Amount'],
      [['03/04/2026', 'Coffee', '-4.50']],
    );
    expect(result.warnings.join(' ')).toMatch(/ambiguous/i);
  });

  it('reports which columns it matched', () => {
    const result = suggestMapping(
      ['Date', 'Memo', 'Amount'],
      [['2026-03-01', 'Coffee', '-4.50']],
    );
    expect(result.matched).toMatchObject({ date: 'Date', description: 'Memo', amount: 'Amount' });
  });
});
