import type { Pool } from 'pg';

import type { ReceiptRecord, ReceiptStore } from '../../ports/receipts';
import { withUserScope } from '../postgres/pool';

export class InMemoryReceiptStore implements ReceiptStore {
  private readonly byUser = new Map<string, ReceiptRecord[]>();

  private bucket(userId: string): ReceiptRecord[] {
    const existing = this.byUser.get(userId);
    if (existing) return existing;
    const fresh: ReceiptRecord[] = [];
    this.byUser.set(userId, fresh);
    return fresh;
  }

  async upsert(userId: string, receipt: ReceiptRecord): Promise<ReceiptRecord> {
    const rows = this.bucket(userId);
    const index = receipt.transactionId
      ? rows.findIndex((row) => row.transactionId === receipt.transactionId)
      : -1;
    if (index >= 0) {
      // One receipt per transaction: update in place, keeping the original id
      // so the Postgres adapter and this one behave identically.
      const existing = rows[index]!;
      rows[index] = { ...receipt, id: existing.id };
    } else {
      rows.push(receipt);
    }
    return receipt;
  }

  async getByTransaction(
    userId: string,
    transactionId: string,
  ): Promise<ReceiptRecord | null> {
    return (
      this.bucket(userId).find((row) => row.transactionId === transactionId) ??
      null
    );
  }

  async purgeUser(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}

interface ReceiptRow {
  id: string;
  user_id: string;
  transaction_id: string | null;
  merchant: string | null;
  receipt_date: string | null;
  total_minor: number | null;
  tax_minor: number | null;
  currency: string | null;
  items: string[];
  text: string;
  created_at: Date;
}

const COLUMNS = `id, user_id, transaction_id, merchant, receipt_date, total_minor,
  tax_minor, currency, items, text, created_at`;

function toRecord(row: ReceiptRow): ReceiptRecord {
  return {
    id: row.id,
    userId: row.user_id,
    transactionId: row.transaction_id,
    merchant: row.merchant,
    receiptDate: row.receipt_date,
    totalMinor: row.total_minor,
    taxMinor: row.tax_minor,
    currency: row.currency,
    items: row.items,
    text: row.text,
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresReceiptStore implements ReceiptStore {
  constructor(private readonly pg: Pool) {}

  async upsert(userId: string, receipt: ReceiptRecord): Promise<ReceiptRecord> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<ReceiptRow>(
        `INSERT INTO receipts
           (id, user_id, transaction_id, merchant, receipt_date, total_minor,
            tax_minor, currency, items, text, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, transaction_id) DO UPDATE SET
           merchant = EXCLUDED.merchant,
           receipt_date = EXCLUDED.receipt_date,
           total_minor = EXCLUDED.total_minor,
           tax_minor = EXCLUDED.tax_minor,
           currency = EXCLUDED.currency,
           items = EXCLUDED.items,
           text = EXCLUDED.text
         RETURNING ${COLUMNS}`,
        [
          receipt.id,
          receipt.userId,
          receipt.transactionId,
          receipt.merchant,
          receipt.receiptDate,
          receipt.totalMinor,
          receipt.taxMinor,
          receipt.currency,
          receipt.items,
          receipt.text,
          new Date(receipt.createdAt),
        ],
      );
      return toRecord(rows[0]!);
    });
  }

  async getByTransaction(
    userId: string,
    transactionId: string,
  ): Promise<ReceiptRecord | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<ReceiptRow>(
        `SELECT ${COLUMNS} FROM receipts
         WHERE user_id = $1 AND transaction_id = $2`,
        [userId, transactionId],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    });
  }

  async purgeUser(userId: string): Promise<void> {
    await this.pg.query('DELETE FROM receipts WHERE user_id = $1', [userId]);
  }
}
