import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

import { PostgresStatementImportStore } from '../src/infra/postgres/statement-import-stores';
import { PostgresTransactionStore } from '../src/infra/postgres/stores';
import { AesGcmStatementFileCipher } from '../src/infra/statement-file-cipher';
import { closePool, withUserScope } from '../src/infra/postgres/pool';
import type { StatementImport, StatementRowRecord } from '../src/domain/statement-import/types';
import type { ImportBatch } from '../src/ports';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

const ALICE = 'statement_pg_alice';
const BOB = 'statement_pg_bob';

if (!OWNER_URL) {
  describe('manual statement imports on PostgreSQL', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
} else {
  const ownerUrl = OWNER_URL;
  describe('manual statement imports on PostgreSQL', () => {
    let harness: PgHarness;
    let owner: Pool;
    let app: Pool;
    let store: PostgresStatementImportStore;
    let transactions: PostgresTransactionStore;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
      owner = harness.owner;
      app = harness.app;
      store = new PostgresStatementImportStore(app, new AesGcmStatementFileCipher(Buffer.alloc(32, 7)));
      transactions = new PostgresTransactionStore(app);
    });

    afterAll(async () => { await harness.close(); await closePool(); });

    beforeEach(async () => {
      await owner.query('DELETE FROM users WHERE id = ANY($1)', [[ALICE, BOB]]);
      for (const userId of [ALICE, BOB]) {
        await owner.query('INSERT INTO users (id) VALUES ($1)', [userId]);
        await owner.query(`INSERT INTO accounts (id,user_id,name,type,mask,currency,balance_current) VALUES ($1,$2,'Checking','checking','0000','USD',0)`, [`acc_${userId}`, userId]);
      }
    });

    function fixture(userId = ALICE): { statement: StatementImport; row: StatementRowRecord; batch: ImportBatch } {
      const statement: StatementImport = { id: `stmt_${userId}`, accountId: `acc_${userId}`, filename: 'march.csv', mimeType: 'text/csv', format: 'csv', statementHash: 'c'.repeat(64), status: 'ready', rowsTotal: 1, rowsIncluded: 1, rowsExcluded: 0, rowsNeedsReview: 0, createdAt: '2026-08-01T00:00:00.000Z', processedAt: '2026-08-01T00:00:00.000Z', approvedAt: null, sourceDeletedAt: null, error: null };
      const row: StatementRowRecord = { id: `row_${userId}`, importId: statement.id, sourceLine: 2, postedAt: '2026-08-01', description: 'GROCERY MART', merchant: 'Grocery', amount: -1200, currency: 'USD', direction: 'debit', categorySlug: 'groceries', categorySource: 'lexicon', categoryConfidence: 0.9, isRecurring: false, flags: [], decision: 'include', fingerprint: 'd'.repeat(64), raw: '2026-08-01,GROCERY MART,-12.00', editedAt: null };
      const batch: ImportBatch = { id: `batch_${userId}`, accountId: statement.accountId, filename: statement.filename, status: 'committed', rowsTotal: 1, rowsImported: 1, rowsDuplicate: 0, rowsInvalid: 0, createdAt: statement.createdAt, revertedAt: null };
      return { statement, row, batch };
    }

    it('persists staged rows, finalizes atomically, and leaves source deletable', async () => {
      const { statement, row, batch } = fixture();
      await store.create(ALICE, statement, `v1.encrypted.${'x'.repeat(16)}`, [row]);
      expect((await store.rows(ALICE, statement.id))[0]?.description).toBe('GROCERY MART');
      const persisted = await owner.query<{ description: string; merchant: string | null; raw: string; encrypted_fields: string | null }>(
        'SELECT description, merchant, raw, encrypted_fields FROM statement_import_rows WHERE user_id=$1 AND import_id=$2',
        [ALICE, statement.id],
      );
      expect(persisted.rows[0]).toMatchObject({ description: '[encrypted]', merchant: null, raw: '[encrypted]' });
      expect(persisted.rows[0]?.encrypted_fields).toMatch(/^v1\./);
      expect(persisted.rows[0]?.encrypted_fields).not.toContain('GROCERY MART');
      const updated = await store.updateRow(ALICE, statement.id, row.id, { decision: 'exclude' }, { id: 'evt-edit', importId: statement.id, rowId: row.id, kind: 'row_edited', detail: { decision: 'exclude' }, createdAt: '2026-08-01T01:00:00.000Z' });
      expect(updated?.decision).toBe('exclude');
      expect((await store.rows(ALICE, statement.id))[0]?.raw).toBe(row.raw);
      await store.updateRow(ALICE, statement.id, row.id, { decision: 'include' }, { id: 'evt-include', importId: statement.id, rowId: row.id, kind: 'row_edited', detail: { decision: 'include' }, createdAt: '2026-08-01T02:00:00.000Z' });
      const finalized = await store.finalize(ALICE, statement.id, batch, [{ id: 'txn_stmt', accountId: statement.accountId, providerTxnId: 'manual_d'.repeat(1), postedAt: row.postedAt!, amount: row.amount!, currency: row.currency, rawDescriptor: row.description, normalizedDescriptor: 'grocery mart', categorySlug: row.categorySlug, categorySource: row.categorySource, categoryConfidence: row.categoryConfidence, isRecurring: false, pending: false, importBatchId: batch.id }], { id: 'evt-approved', importId: statement.id, rowId: null, kind: 'approved', detail: {}, createdAt: '2026-08-01T03:00:00.000Z' });
      expect(finalized?.status).toBe('approved');
      expect((await transactions.list(ALICE, { accountId: statement.accountId })).some((txn) => txn.importBatchId === batch.id)).toBe(true);
      expect(await store.deleteSource(ALICE, statement.id, '2026-08-01T04:00:00.000Z', { id: 'evt-delete-source', importId: statement.id, rowId: null, kind: 'source_deleted', detail: {}, createdAt: '2026-08-01T04:00:00.000Z' })).toBe(true);
      expect((await store.audit(ALICE, statement.id)).map((event) => event.kind)).toEqual(expect.arrayContaining(['created', 'processed', 'row_edited', 'approved', 'source_deleted']));
    });

    it('enforces user isolation on staged rows and audit events under forced RLS', async () => {
      const alice = fixture(ALICE);
      const bob = fixture(BOB);
      await store.create(ALICE, alice.statement, 'cipher-a', [alice.row]);
      await store.create(BOB, bob.statement, 'cipher-b', [bob.row]);
      expect(await store.get(BOB, alice.statement.id)).toBeNull();
      const visible = await withUserScope(app, ALICE, (client) => client.query<{ user_id: string }>('SELECT user_id FROM statement_import_rows'));
      expect(visible.rows).toEqual([{ user_id: ALICE }]);
      const unscoped = await app.query('SELECT user_id FROM statement_import_events');
      expect(unscoped.rows).toHaveLength(0);
    });

    it('fails closed when staged row ciphertext is tampered with', async () => {
      const { statement, row } = fixture();
      await store.create(ALICE, statement, 'cipher-row', [row]);
      await owner.query(
        `UPDATE statement_import_rows
            SET encrypted_fields = 'v1.invalid.invalid.invalid'
          WHERE user_id=$1 AND import_id=$2 AND id=$3`,
        [ALICE, statement.id, row.id],
      );
      await expect(store.rows(ALICE, statement.id)).rejects.toThrow();
    });

    it('rolls back approval when a concurrent or prior row wins the transaction uniqueness race', async () => {
      const first = fixture();
      await store.create(ALICE, first.statement, 'cipher-first', [first.row]);
      const existingTxn = {
        id: 'txn-existing', accountId: first.statement.accountId, providerTxnId: 'manual-race',
        postedAt: first.row.postedAt!, amount: first.row.amount!, currency: first.row.currency,
        rawDescriptor: first.row.description, normalizedDescriptor: 'grocery mart', categorySlug: first.row.categorySlug,
        categorySource: first.row.categorySource, categoryConfidence: first.row.categoryConfidence, isRecurring: false,
        pending: false, importBatchId: 'batch-existing',
      } as const;
      await transactions.upsertMany(ALICE, [existingTxn]);

      const second = fixture();
      second.statement.id = 'stmt_race';
      second.statement.statementHash = 'e'.repeat(64);
      second.row.id = 'row_race';
      second.row.importId = second.statement.id;
      await store.create(ALICE, second.statement, 'cipher-race', [second.row]);
      await expect(store.finalize(ALICE, second.statement.id, second.batch, [{ ...existingTxn, id: 'txn-race', providerTxnId: 'manual-race', importBatchId: second.batch.id }], { id: 'evt-race', importId: second.statement.id, rowId: null, kind: 'approved', detail: {}, createdAt: '2026-08-01T05:00:00.000Z' })).rejects.toThrow('STATEMENT_DUPLICATE');
      expect((await store.get(ALICE, second.statement.id))?.status).toBe('ready');
      expect((await transactions.list(ALICE, { accountId: first.statement.accountId })).filter((txn) => txn.providerTxnId === 'manual-race')).toHaveLength(1);
    });

    it('claims queued work through the restricted role and recovers a stale lease', async () => {
      const queued = fixture();
      queued.statement.id = 'stmt_queue';
      queued.statement.statementHash = 'f'.repeat(64);
      queued.statement.status = 'queued';
      queued.statement.rowsTotal = 0;
      queued.statement.rowsIncluded = 0;
      queued.statement.processedAt = null;
      queued.row.id = 'row_queue';
      queued.row.importId = queued.statement.id;
      await store.enqueue(ALICE, queued.statement, 'cipher-queued');

      const [claimed] = await store.claim(1);
      expect(claimed).toMatchObject({ id: queued.statement.id, userId: ALICE, accountId: queued.statement.accountId, attempts: 1 });
      expect((await store.source(ALICE, queued.statement.id))?.encryptedSource).toBe('cipher-queued');

      await owner.query(
        `UPDATE statement_imports
            SET processing_started_at = now() - interval '10 minutes'
          WHERE user_id=$1 AND id=$2`,
        [ALICE, queued.statement.id],
      );
      const [reclaimed] = await store.claim(1);
      expect(reclaimed?.attempts).toBe(2);

      const completed = await store.completeProcessing(
        ALICE,
        queued.statement.id,
        [queued.row],
        '2026-08-01T01:00:00.000Z',
        { id: 'evt-processed-queue', importId: queued.statement.id, rowId: null, kind: 'processed', detail: { rows: 1 }, createdAt: '2026-08-01T01:00:00.000Z' },
      );
      expect(completed?.status).toBe('ready');
      expect((await store.rows(ALICE, queued.statement.id))).toHaveLength(1);
      expect((await store.claim(1))).toHaveLength(0);
    });
  });
}
