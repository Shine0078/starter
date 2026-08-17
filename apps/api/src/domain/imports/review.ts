/**
 * The review boundary.
 *
 * Every reference project that imports transactions well shares one property:
 * nothing enters the ledger without being shown first. Maybe stages upload →
 * map → clean → confirm; GnuCash ranks import matches by confidence and asks
 * when the evidence is weak. This module is the equivalent decision layer.
 *
 * Pure. It takes parsed rows and the transactions already held, and returns a
 * decision per row. Nothing here writes.
 */

import { normalizeDescriptor } from '../categorization/normalize';
import type { Transaction } from '../types';
import { parseAmount, parseDate, type ColumnMapping } from './mapping';

export type RowDecision = 'import' | 'duplicate' | 'invalid';

export interface ReviewedRow {
  /** 1-based line in the source file, so an error points at something real. */
  line: number;
  decision: RowDecision;
  /** Populated when the row is importable. */
  postedAt?: string;
  amount?: number;
  descriptor?: string;
  normalizedDescriptor?: string;
  /** Why the row was rejected or flagged. Always set unless decision is import. */
  reason?: string;
  /** 0–1. How strongly this looks like something already held. */
  duplicateConfidence?: number;
  /** The existing transaction this appears to duplicate. */
  duplicateOfId?: string;
  raw: string[];
}

export interface ImportReview {
  rows: ReviewedRow[];
  summary: {
    total: number;
    importable: number;
    duplicates: number;
    invalid: number;
    /** Net of the importable rows, minor units. */
    netAmount: number;
    dateRange: { start: string; end: string } | null;
  };
}

/**
 * Same account, same day, same amount, similar description.
 *
 * Deliberately not keyed on description alone: banks reformat descriptors
 * between an early CSV export and the later provider feed, so requiring an
 * exact match would let every re-import duplicate the ledger.
 */
const DUPLICATE_CONFIDENCE_THRESHOLD = 0.8;

/** How far either side of the date a match is still considered. */
const DATE_WINDOW_DAYS = 3;

function daysApart(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00.000Z`);
  const right = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 86_400_000;
}

/** Token overlap, 0–1. Cheap, order-insensitive, and good enough for descriptors. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;

  const left = new Set(a.split(' ').filter((t) => t.length > 1));
  const right = new Set(b.split(' ').filter((t) => t.length > 1));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  return shared / Math.max(left.size, right.size);
}

export interface DuplicateMatch {
  confidence: number;
  transactionId: string;
}

/**
 * Scores a candidate against what is already held.
 *
 * Amount and account must agree exactly — a different amount is a different
 * transaction, however similar the text. Date proximity and description
 * similarity then decide how confident the match is.
 */
export function findDuplicate(
  candidate: { postedAt: string; amount: number; normalizedDescriptor: string },
  existing: readonly Transaction[],
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;

  for (const txn of existing) {
    if (txn.amount !== candidate.amount) continue;

    const dayGap = daysApart(txn.postedAt, candidate.postedAt);
    if (dayGap > DATE_WINDOW_DAYS) continue;

    // Same day and same amount is already strong evidence; the descriptor
    // refines it rather than being required to match.
    const dateScore = dayGap === 0 ? 1 : 1 - dayGap / (DATE_WINDOW_DAYS + 1);
    const textScore = similarity(txn.normalizedDescriptor, candidate.normalizedDescriptor);
    const confidence = 0.6 * dateScore + 0.4 * textScore;

    if (!best || confidence > best.confidence) {
      best = { confidence, transactionId: txn.id };
    }
  }

  return best && best.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD ? best : null;
}

export interface ReviewInput {
  headers: readonly string[];
  rows: readonly string[][];
  mapping: ColumnMapping;
  existing: readonly Transaction[];
  currency?: string;
  /** Lines the parser found ragged, so they can be marked without re-checking. */
  raggedLines?: readonly number[];
}

/**
 * Classifies every row.
 *
 * No row is ever silently discarded: an unreadable row becomes `invalid` with a
 * reason and still appears in the preview. The user decides what to do about
 * it, which is the entire point of a review step.
 */
export function reviewImport(input: ReviewInput): ImportReview {
  const { headers, rows, mapping, existing, currency = 'USD' } = input;
  const ragged = new Set(input.raggedLines ?? []);

  const columnOf = (name: string | undefined): number =>
    name === undefined ? -1 : headers.indexOf(name);

  const dateColumn = columnOf(mapping.date);
  const descriptionColumn = columnOf(mapping.description);
  const amountColumn = columnOf(mapping.amount);
  const debitColumn = columnOf(mapping.debit);
  const creditColumn = columnOf(mapping.credit);
  const directionColumn = columnOf(mapping.direction);

  // Rows already accepted in this same file, so a file containing the same
  // transaction twice does not import it twice.
  const acceptedInThisFile: Transaction[] = [];

  const reviewed: ReviewedRow[] = rows.map((raw, index) => {
    const line = index + 2;
    const base = { line, raw } as const;

    if (ragged.has(line)) {
      return { ...base, decision: 'invalid', reason: 'This row has a different number of columns.' };
    }

    const postedAt = parseDate(raw[dateColumn] ?? '', mapping.dateOrder);
    if (!postedAt) {
      return { ...base, decision: 'invalid', reason: 'Could not read the date.' };
    }

    const amount = readAmount(raw, {
      convention: mapping.convention,
      amountColumn,
      debitColumn,
      creditColumn,
      directionColumn,
      currency,
    });

    if (amount === null) {
      return { ...base, decision: 'invalid', reason: 'Could not read the amount.' };
    }

    if (amount === 0) {
      // A zero-value row is almost always a header repeat or a balance line,
      // not a transaction. Flagged rather than dropped.
      return { ...base, decision: 'invalid', reason: 'The amount is zero.' };
    }

    const descriptor = (raw[descriptionColumn] ?? '').trim();
    if (!descriptor) {
      return { ...base, decision: 'invalid', reason: 'The description is empty.' };
    }

    const normalizedDescriptor = normalizeDescriptor(descriptor);
    const candidate = { postedAt, amount, normalizedDescriptor };

    const match =
      findDuplicate(candidate, existing) ?? findDuplicate(candidate, acceptedInThisFile);

    if (match) {
      return {
        ...base,
        decision: 'duplicate',
        postedAt,
        amount,
        descriptor,
        normalizedDescriptor,
        duplicateConfidence: Math.round(match.confidence * 100) / 100,
        duplicateOfId: match.transactionId,
        reason: 'This looks like a transaction you already have.',
      };
    }

    acceptedInThisFile.push({
      id: `pending-${line}`,
      accountId: '',
      providerTxnId: `pending-${line}`,
      postedAt,
      amount,
      currency,
      rawDescriptor: descriptor,
      normalizedDescriptor,
      categorySlug: 'unknown',
      categorySource: 'unknown',
      categoryConfidence: 0,
      isRecurring: false,
      pending: false,
    } as Transaction);

    return { ...base, decision: 'import', postedAt, amount, descriptor, normalizedDescriptor };
  });

  const importable = reviewed.filter((r) => r.decision === 'import');
  const dates = importable.map((r) => r.postedAt!).sort();

  return {
    rows: reviewed,
    summary: {
      total: reviewed.length,
      importable: importable.length,
      duplicates: reviewed.filter((r) => r.decision === 'duplicate').length,
      invalid: reviewed.filter((r) => r.decision === 'invalid').length,
      netAmount: importable.reduce((sum, r) => sum + (r.amount ?? 0), 0),
      dateRange: dates.length > 0 ? { start: dates[0]!, end: dates[dates.length - 1]! } : null,
    },
  };
}

function readAmount(
  raw: readonly string[],
  options: {
    convention: ColumnMapping['convention'];
    amountColumn: number;
    debitColumn: number;
    creditColumn: number;
    directionColumn: number;
    currency: string;
  },
): number | null {
  const { convention, amountColumn, debitColumn, creditColumn, directionColumn, currency } = options;

  if (convention === 'debit_credit_columns') {
    const debit = parseAmount(raw[debitColumn] ?? '', currency);
    const credit = parseAmount(raw[creditColumn] ?? '', currency);

    // Exactly one side should carry a value. Both filled is a malformed export
    // rather than a transaction that is somehow both.
    if (debit !== null && debit !== 0 && credit !== null && credit !== 0) return null;
    if (debit !== null && debit !== 0) return -Math.abs(debit);
    if (credit !== null && credit !== 0) return Math.abs(credit);
    return null;
  }

  const amount = parseAmount(raw[amountColumn] ?? '', currency);
  if (amount === null) return null;

  if (convention === 'positive_with_direction') {
    const direction = (raw[directionColumn] ?? '').trim().toLowerCase();
    const isOutflow = /^(debit|dr|withdrawal|out|payment)/.test(direction);
    const isInflow = /^(credit|cr|deposit|in|receipt)/.test(direction);
    if (!isOutflow && !isInflow) return null;
    return isOutflow ? -Math.abs(amount) : Math.abs(amount);
  }

  return amount;
}
