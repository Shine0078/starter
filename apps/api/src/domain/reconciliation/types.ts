import type { IsoDate } from '../types';

/**
 * Where the observed balance came from.
 *
 * Recorded because the trustworthiness of an assertion depends on it: a printed
 * statement is authoritative in a way a half-remembered glance at a banking app
 * is not, and a later investigation needs to know which it was.
 */
export type ReconciliationSource =
  | 'statement'
  | 'bank_app'
  | 'atm_receipt'
  | 'manual_count'
  | 'other';

export const RECONCILIATION_SOURCES: readonly ReconciliationSource[] = [
  'statement',
  'bank_app',
  'atm_receipt',
  'manual_count',
  'other',
];

/**
 * A user's claim about what an account's balance actually was on a given date,
 * stored alongside what FINVERSE computed for that same date.
 *
 * This is **evidence, not a correction**. Recording one never edits, inserts, or
 * deletes a transaction. GnuCash and Sure both treat reconciliation this way and
 * the reason is worth stating: an app that silently invents a balancing entry to
 * make the numbers agree destroys the very discrepancy the user needs to see.
 * A difference is a finding to investigate, not an error to paper over.
 */
export interface Reconciliation {
  id: string;
  accountId: string;
  /** The calendar date the balance was observed. */
  statementDate: IsoDate;
  /** Minor units, signed. Negative on a credit card means money owed. */
  observedBalance: number;
  /** Must equal the account's currency — no implicit mixing (ADR-0003). */
  currency: string;
  /** What FINVERSE derived for that date, frozen at the time of assertion. */
  computedBalance: number;
  /** `observed - computed`. Zero means agreement. */
  difference: number;
  source: ReconciliationSource;
  note: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** Set when withdrawn. Archived rather than deleted: it is an audit record. */
  archivedAt: string | null;
}

/**
 * Deliberately binary.
 *
 * There is no "close enough" band. Within a single currency every amount is an
 * exact integer in minor units, so there is no rounding to absorb — a one-cent
 * gap is a real one-cent gap, and a tolerance would only hide the small
 * systematic errors that are hardest to find later.
 */
export type ReconciliationStatus = 'balanced' | 'unbalanced';

export interface ReconciliationOutcome {
  computedBalance: number;
  difference: number;
  status: ReconciliationStatus;
  /** Settled transactions unwound to reach the historical balance. */
  transactionsConsidered: number;
  /** Plain-language explanation of the number, for the UI and for reports. */
  explanation: string;
}
