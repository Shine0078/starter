import type { Transaction } from '../types';

export type StatementFormat = 'csv' | 'xlsx' | 'pdf' | 'image';
export type StatementRowDecision = 'include' | 'exclude' | 'needs_review';

/** Safe, non-sensitive identity metadata derived from the document header. */
export interface StatementDocumentDetails {
  issuer: string | null;
  accountReferenceLast4: string | null;
  statementDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
}

/** Opaque routing data returned when the durable analysis worker claims work. */
export interface StatementImportJob {
  id: string;
  userId: string;
  accountId: string;
  attempts: number;
}

/** A row extracted from a statement, before it is allowed into the ledger. */
export interface StatementRowDraft {
  sourceLine: number;
  postedAt: string | null;
  description: string;
  merchant: string | null;
  amount: number | null;
  currency: string;
  direction: 'debit' | 'credit' | 'unknown';
  categorySlug: string;
  categorySource: Transaction['categorySource'];
  categoryConfidence: number;
  isRecurring: boolean;
  flags: string[];
  decision: StatementRowDecision;
  fingerprint: string;
  raw: string;
}

export interface StatementExtraction {
  format: StatementFormat;
  rows: StatementRowDraft[];
  warnings: string[];
  statementHash: string;
  documentDetails?: StatementDocumentDetails;
  sourceText?: string;
}

export interface StatementImport {
  id: string;
  accountId: string;
  filename: string;
  mimeType: string;
  format: StatementFormat;
  statementHash: string;
  status: 'queued' | 'processing' | 'ready' | 'approved' | 'failed' | 'deleted';
  rowsTotal: number;
  rowsIncluded: number;
  rowsExcluded: number;
  rowsNeedsReview: number;
  createdAt: string;
  processedAt: string | null;
  approvedAt: string | null;
  sourceDeletedAt: string | null;
  error: string | null;
  documentDetails?: StatementDocumentDetails;
}

export interface StatementRowRecord extends StatementRowDraft {
  id: string;
  importId: string;
  editedAt: string | null;
}

export type StatementImportEventKind =
  | 'created'
  | 'processed'
  | 'row_edited'
  | 'row_split'
  | 'rows_merged'
  | 'approved'
  | 'source_deleted'
  | 'deleted'
  | 'failed';

export interface StatementImportEvent {
  id: string;
  importId: string;
  rowId: string | null;
  kind: StatementImportEventKind;
  detail: Record<string, unknown>;
  createdAt: string;
}

export const STATEMENT_CATEGORIES = [
  'income', 'groceries', 'rent', 'utilities', 'transportation', 'dining',
  'shopping', 'subscriptions', 'healthcare', 'entertainment', 'debt_payments',
  'transfers', 'fees', 'savings', 'investments', 'refunds', 'other',
] as const;
