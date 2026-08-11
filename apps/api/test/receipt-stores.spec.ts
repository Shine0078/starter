import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ReceiptStore } from '../src/ports/receipts';
import {
  InMemoryReceiptStore,
  PostgresReceiptStore,
} from '../src/infra/receipts/receipt-stores';
import { closePool } from '../src/infra/postgres/pool';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

async function provesReceiptStore(
  store: ReceiptStore,
  userId: string,
  transactionId: string,
): Promise<void> {
  const record = {
    id: randomUUID(),
    userId,
    transactionId,
    merchant: 'Blue Bottle Coffee',
    receiptDate: '2026-08-10',
    totalMinor: 1142,
    taxMinor: 92,
    currency: 'USD',
    items: ['Cappuccino 4.50', 'Pour Over 6.00'],
    text: 'Blue Bottle Coffee\nTotal Due 11.42',
    createdAt: '2026-08-10T12:00:00.000Z',
  };

  await store.upsert(userId, record);
  const found = await store.getByTransaction(userId, transactionId);
  expect(found?.merchant).toBe('Blue Bottle Coffee');
  expect(found?.totalMinor).toBe(1142);

  // Re-scan replaces the stored receipt rather than duplicating, keeping the
  // same row for the transaction.
  const replacement = { ...record, id: randomUUID(), totalMinor: 1200 };
  await store.upsert(userId, replacement);
  const replaced = await store.getByTransaction(userId, transactionId);
  expect(replaced?.totalMinor).toBe(1200);
  expect(replaced?.transactionId).toBe(transactionId);
  expect(replaced?.merchant).toBe(record.merchant);
}

describe('receipt store contract: in-memory', () => {
  it('upserts, replaces, and reads back a receipt', async () => {
    await provesReceiptStore(new InMemoryReceiptStore(), randomUUID(), randomUUID());
  });
});

const ownerUrl = OWNER_URL;

if (ownerUrl) {
  describe('receipt store contract: postgres', () => {
    let harness: PgHarness;
    let userId: string;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
      userId = randomUUID();
      await harness.owner.query(
        "INSERT INTO users (id,email,password_hash,status) VALUES ($1,$2,'hash','active')",
        [userId, `receipt-${userId}@example.com`],
      );
    });

    afterAll(async () => {
      if (harness && userId) await harness.owner.query('DELETE FROM users WHERE id=$1', [userId]);
      await harness?.close();
      await closePool();
    });

    it('upserts, replaces, and reads back a receipt through the runtime role', async () => {
      const transactionId = `txn-${randomUUID()}`;
      await harness.owner.query(
        `INSERT INTO accounts (id, user_id, name, type, mask, currency, balance_current)
         VALUES ($1, $2, 'Checking', 'checking', '0000', 'USD', 100000)`,
        [`acc-${userId}`, userId],
      );
      await harness.owner.query(
        `INSERT INTO transactions
           (id, user_id, account_id, provider_txn_id, posted_at, amount, currency,
            raw_descriptor, normalized_descriptor, category_slug, category_source,
            category_confidence)
         VALUES ($1, $2, $3, $4, '2026-08-01', -1142, 'USD', 'BLUE BOTTLE',
                 'blue bottle', 'coffee', 'lexicon', 0.95)`,
        [transactionId, userId, `acc-${userId}`, `prov-${userId}`],
      );
      await provesReceiptStore(new PostgresReceiptStore(harness.app), userId, transactionId);
    });
  });
}
