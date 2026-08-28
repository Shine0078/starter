import { describe, expect, it } from 'vitest';

import { InMemoryStatementImportStore } from '../src/infra/statement-import-store';
import type { StatementImport, StatementRowRecord } from '../src/domain/statement-import/types';

describe('in-memory statement analysis queue', () => {
  it('claims, completes, and does not requeue a processed import', async () => {
    const store = new InMemoryStatementImportStore();
    const statement: StatementImport = {
      id: 'stmt_queue_memory',
      accountId: 'account_memory',
      filename: 'statement.csv',
      mimeType: 'text/csv',
      format: 'csv',
      statementHash: 'a'.repeat(64),
      status: 'queued',
      rowsTotal: 0,
      rowsIncluded: 0,
      rowsExcluded: 0,
      rowsNeedsReview: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      processedAt: null,
      approvedAt: null,
      sourceDeletedAt: null,
      error: null,
    };
    const row: StatementRowRecord = {
      id: 'row_queue_memory',
      importId: statement.id,
      sourceLine: 2,
      postedAt: '2026-08-01',
      description: 'GROCERY MART',
      merchant: 'Grocery',
      amount: -1200,
      currency: 'USD',
      direction: 'debit',
      categorySlug: 'groceries',
      categorySource: 'lexicon',
      categoryConfidence: 0.9,
      isRecurring: false,
      flags: [],
      decision: 'include',
      fingerprint: 'b'.repeat(64),
      raw: '2026-08-01,GROCERY MART,-12.00',
      editedAt: null,
    };

    await store.enqueue('user_memory', statement, 'ciphertext');
    expect(await store.claim(10)).toEqual([
      { id: statement.id, userId: 'user_memory', accountId: statement.accountId, attempts: 1 },
    ]);
    expect(await store.source('user_memory', statement.id)).toMatchObject({ encryptedSource: 'ciphertext' });
    expect((await store.completeProcessing(
      'user_memory',
      statement.id,
      [row],
      '2026-08-01T00:01:00.000Z',
      { id: 'evt_processed_memory', importId: statement.id, rowId: null, kind: 'processed', detail: { rows: 1 }, createdAt: '2026-08-01T00:01:00.000Z' },
    ))?.status).toBe('ready');
    expect(await store.claim(10)).toEqual([]);
    expect((await store.rows('user_memory', statement.id))[0]?.description).toBe('GROCERY MART');
  });
});
