/**
 * Turning arbitrary CSV columns into transactions the ledger understands.
 *
 * Two hard problems live here, and both are places where a wrong guess corrupts
 * money silently rather than failing:
 *
 *   - **Date order.** `03/04/2026` is 3 April or 4 March depending on the bank.
 *   - **Sign convention.** Some exports use a signed amount column, others two
 *     columns (debit/credit), others a positive amount with a separate
 *     direction column.
 *
 * Nothing here guesses when the evidence is ambiguous. It reports what it can
 * infer, with confidence, and leaves the decision to the review step.
 */

import { majorToMinor } from '../money';

export type AmountConvention = 'signed' | 'debit_credit_columns' | 'positive_with_direction';

export interface ColumnMapping {
  date: string;
  description: string;
  /** Used by `signed` and `positive_with_direction`. */
  amount?: string;
  /** Used by `debit_credit_columns`. */
  debit?: string;
  credit?: string;
  /** Used by `positive_with_direction`. */
  direction?: string;
  convention: AmountConvention;
  /** `DMY` or `MDY`. `YMD` is unambiguous and detected automatically. */
  dateOrder: 'DMY' | 'MDY' | 'YMD';
}

/** Header names banks actually use, lowercased. */
const DATE_HEADERS = [
  'date', 'transaction date', 'posted date', 'posting date', 'value date',
  'booking date', 'date posted', 'trans date', 'completed date',
];
const DESCRIPTION_HEADERS = [
  'description', 'details', 'memo', 'narrative', 'payee', 'merchant',
  'transaction', 'reference', 'name', 'particulars',
];
const AMOUNT_HEADERS = ['amount', 'value', 'transaction amount', 'amount (gbp)', 'amount (usd)'];
const DEBIT_HEADERS = ['debit', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'outflow'];
const CREDIT_HEADERS = ['credit', 'deposit', 'deposits', 'money in', 'paid in', 'inflow'];

function findHeader(headers: readonly string[], candidates: readonly string[]): string | undefined {
  const lowered = headers.map((h) => h.toLowerCase().trim());

  // Exact match first: a file with both "Date" and "Date Posted" should bind
  // "Date" rather than whichever happens to contain the substring.
  for (const candidate of candidates) {
    const exact = lowered.indexOf(candidate);
    if (exact >= 0) return headers[exact];
  }

  for (const candidate of candidates) {
    const partial = lowered.findIndex((h) => h.includes(candidate));
    if (partial >= 0) return headers[partial];
  }

  return undefined;
}

export interface MappingSuggestion {
  mapping: ColumnMapping | null;
  /** Everything the caller must confirm before importing. */
  warnings: string[];
  /** Columns that were recognised, for showing the user what was matched. */
  matched: Record<string, string>;
}

/**
 * Proposes a mapping from the header row.
 *
 * Returns `null` rather than a partial guess when a required column is missing.
 * A half-mapped import is worse than none: it produces rows that look right.
 */
export function suggestMapping(headers: readonly string[], sample: readonly string[][]): MappingSuggestion {
  const warnings: string[] = [];
  const matched: Record<string, string> = {};

  const date = findHeader(headers, DATE_HEADERS);
  const description = findHeader(headers, DESCRIPTION_HEADERS);
  const amount = findHeader(headers, AMOUNT_HEADERS);
  const debit = findHeader(headers, DEBIT_HEADERS);
  const credit = findHeader(headers, CREDIT_HEADERS);

  if (date) matched.date = date;
  if (description) matched.description = description;
  if (amount) matched.amount = amount;
  if (debit) matched.debit = debit;
  if (credit) matched.credit = credit;

  if (!date) warnings.push('No date column was recognised. Choose one.');
  if (!description) warnings.push('No description column was recognised. Choose one.');

  let convention: AmountConvention | null = null;
  if (debit && credit) convention = 'debit_credit_columns';
  else if (amount) convention = 'signed';

  if (!convention) {
    warnings.push('No amount column was recognised. Choose one, or a debit and credit pair.');
  }

  if (!date || !description || !convention) {
    return { mapping: null, warnings, matched };
  }

  const dateColumn = headers.indexOf(date);
  const dateOrder = detectDateOrder(sample.map((row) => row[dateColumn] ?? ''));

  if (dateOrder.ambiguous) {
    // Never guessed. Picking wrong silently moves transactions by months.
    warnings.push(
      'Dates like 03/04/2026 are ambiguous. Confirm whether this file is ' +
        'day/month/year or month/day/year.',
    );
  }

  return {
    mapping: {
      date,
      description,
      ...(convention === 'debit_credit_columns' ? { debit, credit } : { amount }),
      convention,
      dateOrder: dateOrder.order,
    },
    warnings,
    matched,
  };
}

export interface DateOrderDetection {
  order: 'DMY' | 'MDY' | 'YMD';
  ambiguous: boolean;
  reason: string;
}

/**
 * Infers date order from the sample.
 *
 * A value above 12 in the first position proves day-first; above 12 in the
 * second proves month-first. When no row proves either, the file is genuinely
 * ambiguous and says so instead of defaulting.
 */
export function detectDateOrder(values: readonly string[]): DateOrderDetection {
  let firstOverTwelve = false;
  let secondOverTwelve = false;
  let isoCount = 0;
  let considered = 0;

  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;

    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value)) {
      isoCount += 1;
      considered += 1;
      continue;
    }

    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(value);
    if (!match) continue;

    considered += 1;
    if (Number(match[1]) > 12) firstOverTwelve = true;
    if (Number(match[2]) > 12) secondOverTwelve = true;
  }

  if (considered > 0 && isoCount === considered) {
    return { order: 'YMD', ambiguous: false, reason: 'All dates are ISO (YYYY-MM-DD).' };
  }

  if (firstOverTwelve && secondOverTwelve) {
    return {
      order: 'DMY',
      ambiguous: true,
      reason: 'Both positions exceed 12 in different rows; the file is inconsistent.',
    };
  }

  if (firstOverTwelve) {
    return { order: 'DMY', ambiguous: false, reason: 'A day above 12 appears first.' };
  }

  if (secondOverTwelve) {
    return { order: 'MDY', ambiguous: false, reason: 'A day above 12 appears second.' };
  }

  return {
    order: 'DMY',
    ambiguous: true,
    reason: 'No row distinguishes day from month. Confirm the order.',
  };
}

/** Parses to `YYYY-MM-DD`, or null when the value is not a date at all. */
export function parseDate(value: string, order: 'DMY' | 'MDY' | 'YMD'): string | null {
  const text = value.trim();
  if (!text) return null;

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  if (!parts) return null;

  const a = Number(parts[1]);
  const b = Number(parts[2]);
  let year = Number(parts[3]);

  // Two-digit years: banks do not export 19xx statements, so the window is
  // anchored forward rather than at 1970.
  if (year < 100) year += year <= 79 ? 2000 : 1900;

  return order === 'MDY' ? build(year, a, b) : build(year, b, a);
}

function build(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Reject a day the month does not have, rather than letting Date roll it
  // forward and turn 31 February into 3 March.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Parses a money string to signed minor units.
 *
 * Handles thousands separators, currency symbols, parenthesised negatives, and
 * the European `1.234,56` form. Returns null on anything it cannot read rather
 * than coercing to zero — a silent zero is a transaction that vanishes.
 */
export function parseAmount(value: string, currency = 'USD'): number | null {
  let text = value.trim();
  if (!text) return null;

  // Accounting convention: (1,234.56) means negative.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  text = text.replace(/[^\d.,\-+]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  if (!text) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal point.
    text = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    // `1,234` is thousands; `1,23` is a decimal comma.
    text = decimals === 3 ? text.replace(/,/g, '') : text.replace(',', '.');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;

  const minor = majorToMinor(parsed, currency);
  return negative ? -minor : minor;
}
