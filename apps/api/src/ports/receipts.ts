/**
 * Receipt ports. Receipts are sensitive (MISSION1: "Receipt images: client-side
 * encrypted; OCR runs on-device; only extracted fields are uploaded"). The
 * architecture therefore stores only extracted fields plus the raw text the
 * user explicitly shared — never an image — and the OCR provider is a port so
 * an on-device or server-side engine can be swapped without touching the
 * domain. The deterministic parser in `domain/receipts/parse` is the local
 * fallback and the reference for provider output.
 */

import type { ReceiptScan } from '../domain/receipts/parse';

export const RECEIPT_OCR_PROVIDER = 'RECEIPT_OCR_PROVIDER';
export const RECEIPT_STORE = 'RECEIPT_STORE';

export interface ReceiptOcrProvider {
  readonly name: string;
  /** False when no external OCR engine is configured; the UI then hides it. */
  readonly configured: boolean;
  /** Recognise a receipt from raw text (or an OCR transcript of an image). */
  recognize(text: string): Promise<ReceiptScan>;
}

export interface ReceiptRecord {
  /** PK (user_id, id). */
  id: string;
  userId: string;
  /** Nullable so a scan can be held before a transaction is chosen. */
  transactionId: string | null;
  merchant: string | null;
  receiptDate: string | null;
  totalMinor: number | null;
  taxMinor: number | null;
  currency: string | null;
  items: string[];
  /** The raw text the user pasted or an OCR transcript. Never an image. */
  text: string;
  createdAt: string;
}

export interface ReceiptStore {
  upsert(userId: string, receipt: ReceiptRecord): Promise<ReceiptRecord>;
  getByTransaction(userId: string, transactionId: string): Promise<ReceiptRecord | null>;
  purgeUser(userId: string): Promise<void>;
}
