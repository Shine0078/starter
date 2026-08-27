import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

import { PostgresStatementImportStore } from '../src/infra/postgres/statement-import-stores';
import { PostgresTransactionStore } from '../src/infra/postgres/stores';
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
      store = new PostgresStatementImportStore(app);
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
      const updated = await store.updateRow(ALICE, statement.id, row.id, { decision: 'exclude' }, { id: 'evt-edit', importId: statement.id, rowId: row.id, kind: 'row_edited', detail: { decision: 'exclude' }, createdAt: '2026-08-01T01:00:00.000Z' });
      expect(updated?.decision).toBe('exclude');
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
  });
}
