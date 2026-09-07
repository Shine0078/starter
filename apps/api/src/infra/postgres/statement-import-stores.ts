import type { Pool, PoolClient } from 'pg';

import type {
  StatementImport,
  StatementImportEvent,
  StatementImportJob,
  StatementRowRecord,
} from '../../domain/statement-import/types';
import type { ImportBatch, StatementImportStore } from '../../ports';
import type { StatementFileCipher } from '../../ports/statement-import';
import type { Transaction } from '../../domain/types';
import { withUserScope } from './pool';

interface StatementRowDb {
  id: string; import_id: string; source_line: number; posted_at: string | null;
  description: string; merchant: string | null; amount: number | null; currency: string;
  direction: string; category_slug: string; category_source: string;
  category_confidence: number; is_recurring: boolean; flags: string[];
  decision: string; fingerprint: string; raw: string; encrypted_fields: string | null;
  edited_at: Date | null;
}

interface StatementDb {
  id: string; account_id: string; filename: string; mime_type: string; format: string;
  statement_hash: string; status: string; rows_total: number; rows_included: number;
  rows_excluded: number; rows_needs_review: number; created_at: Date;
  processed_at: Date | null; approved_at: Date | null; source_deleted_at: Date | null;
  error: string | null; document_details: unknown;
}

interface StatementJobDb {
  id: string;
  user_id: string;
  account_id: string;
  attempts: number;
}

const STATEMENT_COLUMNS = `id, account_id, filename, mime_type, format, statement_hash,
  status, rows_total, rows_included, rows_excluded, rows_needs_review, created_at,
  processed_at, approved_at, source_deleted_at, error, document_details`;
const ROW_COLUMNS = `id, import_id, source_line, posted_at, description, merchant, amount,
  currency, direction, category_slug, category_source, category_confidence,
  is_recurring, flags, decision, fingerprint, raw, encrypted_fields, edited_at`;
const MAX_STAGED_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_IMPORTS = 5;

export class PostgresStatementImportStore implements StatementImportStore {
  constructor(private readonly pg: Pool, private readonly cipher: StatementFileCipher) {}

  async list(userId: string): Promise<StatementImport[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<StatementDb>(`SELECT ${STATEMENT_COLUMNS} FROM statement_imports WHERE user_id = $1 AND status <> 'deleted' ORDER BY created_at DESC`, [userId]);
      return rows.map(toStatement);
    });
  }

  async get(userId: string, id: string): Promise<StatementImport | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<StatementDb>(`SELECT ${STATEMENT_COLUMNS} FROM statement_imports WHERE user_id = $1 AND id = $2 AND status <> 'deleted'`, [userId, id]);
      return rows[0] ? toStatement(rows[0]) : null;
    });
  }

  async rows(userId: string, id: string): Promise<StatementRowRecord[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<StatementRowDb>(`SELECT ${ROW_COLUMNS} FROM statement_import_rows WHERE user_id = $1 AND import_id = $2 ORDER BY source_line, id`, [userId, id]);
      return rows.map((row) => toRow(row, this.cipher));
    });
  }

  async create(userId: string, statement: StatementImport, encryptedSource: string, rows: readonly StatementRowRecord[]): Promise<StatementImport> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      await assertStatementQuota(client, userId, encryptedSource, false);
      try {
        await client.query(`INSERT INTO statement_imports (
          id, user_id, account_id, filename, mime_type, format, statement_hash,
          status, rows_total, rows_included, rows_excluded, rows_needs_review,
          document_details, created_at, processed_at, encrypted_source, source_expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8,$9,$10,$11,$12,$13,$13,$14,$13::timestamptz + interval '90 days')`, [
          statement.id, userId, statement.accountId, statement.filename, statement.mimeType,
          statement.format, statement.statementHash, statement.rowsTotal, statement.rowsIncluded,
          statement.rowsExcluded, statement.rowsNeedsReview, JSON.stringify(statement.documentDetails ?? {}), statement.createdAt, encryptedSource,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('STATEMENT_DUPLICATE');
        throw error;
      }
      await insertRows(client, userId, rows, this.cipher);
      await insertEvent(client, userId, {
        id: `evt_${statement.id}_created`, importId: statement.id, rowId: null,
        kind: 'created', detail: { format: statement.format, rows: rows.length }, createdAt: statement.createdAt,
      });
      await insertEvent(client, userId, {
        id: `evt_${statement.id}_processed`, importId: statement.id, rowId: null,
        kind: 'processed', detail: { rows: rows.length }, createdAt: statement.processedAt ?? statement.createdAt,
      });
      return statement;
    });
  }

  async enqueue(userId: string, statement: StatementImport, encryptedSource: string): Promise<StatementImport> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      await assertStatementQuota(client, userId, encryptedSource, true);
      try {
        await client.query(`INSERT INTO statement_imports (
          id, user_id, account_id, filename, mime_type, format, statement_hash,
          status, rows_total, rows_included, rows_excluded, rows_needs_review,
          document_details, created_at, encrypted_source, source_expires_at, attempts, processing_started_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',0,0,0,0,$8,$9,$10,$9::timestamptz + interval '90 days',0,NULL)`, [
          statement.id, userId, statement.accountId, statement.filename, statement.mimeType,
          statement.format, statement.statementHash, JSON.stringify(statement.documentDetails ?? {}), statement.createdAt, encryptedSource,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('STATEMENT_DUPLICATE');
        throw error;
      }
      await insertEvent(client, userId, {
        id: `evt_${statement.id}_created`, importId: statement.id, rowId: null,
        kind: 'created', detail: { format: statement.format, queued: true }, createdAt: statement.createdAt,
      });
      return statement;
    });
  }

  async claim(limit: number): Promise<StatementImportJob[]> {
    const { rows } = await this.pg.query<StatementJobDb>(
      'SELECT id, user_id, account_id, attempts FROM finverse_claim_statement_imports($1)',
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      attempts: row.attempts,
    }));
  }

  async source(userId: string, importId: string): Promise<{ statement: StatementImport; encryptedSource: string } | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<StatementDb & { encrypted_source: string | null }>(
        `SELECT ${STATEMENT_COLUMNS}, encrypted_source FROM statement_imports
         WHERE user_id=$1 AND id=$2 AND status='processing' FOR UPDATE`,
        [userId, importId],
      );
      const row = rows[0];
      if (!row?.encrypted_source) return null;
      return { statement: toStatement(row), encryptedSource: row.encrypted_source };
    });
  }

  async completeProcessing(userId: string, importId: string, rows: readonly StatementRowRecord[], processedAt: string, event: StatementImportEvent, documentDetails?: StatementImport['documentDetails']): Promise<StatementImport | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows: statements } = await client.query<StatementDb>(
        `SELECT ${STATEMENT_COLUMNS} FROM statement_imports
         WHERE user_id=$1 AND id=$2 FOR UPDATE`,
        [userId, importId],
      );
      if (statements[0]?.status !== 'processing') return null;
      await insertRows(client, userId, rows, this.cipher);
      await refreshCounts(client, userId, importId);
      const { rows: updated } = await client.query<StatementDb>(
        `UPDATE statement_imports
            SET status='ready', processed_at=$3, error=NULL,
                processing_started_at=NULL, document_details=$4::jsonb
          WHERE user_id=$1 AND id=$2 AND status='processing'
          RETURNING ${STATEMENT_COLUMNS}`,
        [userId, importId, processedAt, JSON.stringify(documentDetails ?? {})],
      );
      await insertEvent(client, userId, event);
      return updated[0] ? toStatement(updated[0]) : null;
    });
  }

  async failProcessing(userId: string, importId: string, error: string, at: string, event: StatementImportEvent): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        `UPDATE statement_imports
            SET status='failed', error=$3, processed_at=$4,
                processing_started_at=NULL
          WHERE user_id=$1 AND id=$2 AND status='processing'`,
        [userId, importId, error.slice(0, 500), at],
      );
      if ((result.rowCount ?? 0) === 0) return false;
      await insertEvent(client, userId, event);
      return true;
    });
  }

  async updateRow(userId: string, importId: string, rowId: string, patch: Partial<StatementRowRecord>, event: StatementImportEvent): Promise<StatementRowRecord | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const current = await getRow(client, userId, importId, rowId, this.cipher);
      if (!current || !(await isReady(client, userId, importId))) return null;
      const next = { ...current, ...patch, id: rowId, importId, editedAt: event.createdAt };
      const encrypted = encryptRowFields(next, this.cipher);
      await client.query(`UPDATE statement_import_rows SET posted_at=$4, description=$5, merchant=$6, amount=$7, currency=$8, direction=$9, category_slug=$10, category_source=$11, category_confidence=$12, is_recurring=$13, flags=$14, decision=$15, fingerprint=$16, raw=$17, encrypted_fields=$18, edited_at=$19 WHERE user_id=$1 AND import_id=$2 AND id=$3`, [
        userId, importId, rowId, next.postedAt, encrypted.placeholderDescription, null, next.amount,
        next.currency, next.direction, next.categorySlug, next.categorySource, next.categoryConfidence,
        next.isRecurring, next.flags, next.decision, next.fingerprint, encrypted.placeholderRaw,
        encrypted.payload, event.createdAt,
      ]);
      await refreshCounts(client, userId, importId);
      await insertEvent(client, userId, event);
      return next;
    });
  }

  async updateRowsDecision(userId: string, importId: string, rowIds: readonly string[], decision: StatementRowRecord['decision'], event: StatementImportEvent): Promise<StatementRowRecord[] | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const status = await isReady(client, userId, importId);
      if (!status || rowIds.length === 0) return null;
      const { rows } = await client.query<StatementRowDb>(
        `SELECT ${ROW_COLUMNS} FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND id = ANY($3::text[]) ORDER BY source_line, id FOR UPDATE`,
        [userId, importId, [...new Set(rowIds)]],
      );
      if (rows.length !== new Set(rowIds).size) return null;
      await client.query(
        `UPDATE statement_import_rows SET decision=$4, edited_at=$5 WHERE user_id=$1 AND import_id=$2 AND id = ANY($3::text[])`,
        [userId, importId, [...new Set(rowIds)], decision, event.createdAt],
      );
      await refreshCounts(client, userId, importId);
      await insertEvent(client, userId, event);
      const updated = await client.query<StatementRowDb>(
        `SELECT ${ROW_COLUMNS} FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND id = ANY($3::text[]) ORDER BY source_line, id`,
        [userId, importId, [...new Set(rowIds)]],
      );
      return updated.rows.map((row) => toRow(row, this.cipher));
    });
  }

  async splitRow(userId: string, importId: string, rowId: string, parts: readonly StatementRowRecord[], event: StatementImportEvent): Promise<StatementRowRecord[] | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const current = await getRow(client, userId, importId, rowId, this.cipher);
      if (!current || !(await isReady(client, userId, importId))) return null;
      await client.query(`UPDATE statement_import_rows SET decision='exclude', flags=array_append(flags,'split_parent'), edited_at=$4 WHERE user_id=$1 AND import_id=$2 AND id=$3`, [userId, importId, rowId, event.createdAt]);
      await insertRows(client, userId, parts, this.cipher);
      await refreshCounts(client, userId, importId);
      await insertEvent(client, userId, event);
      return [...parts];
    });
  }

  async mergeRows(userId: string, importId: string, rowIds: readonly string[], merged: StatementRowRecord, event: StatementImportEvent): Promise<StatementRowRecord | null> {
    return withUserScope(this.pg, userId, async (client) => {
      if (!(await isReady(client, userId, importId)) || rowIds.length < 2) return null;
      const { rows } = await client.query<StatementRowDb>(`SELECT ${ROW_COLUMNS} FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND id=ANY($3::text[]) FOR UPDATE`, [userId, importId, rowIds]);
      if (rows.length !== rowIds.length) return null;
      await client.query(`UPDATE statement_import_rows SET decision='exclude', flags=array_append(flags,'merged_parent'), edited_at=$4 WHERE user_id=$1 AND import_id=$2 AND id=ANY($3::text[])`, [userId, importId, rowIds, event.createdAt]);
      await insertRows(client, userId, [merged], this.cipher);
      await refreshCounts(client, userId, importId);
      await insertEvent(client, userId, event);
      return merged;
    });
  }

  async finalize(userId: string, importId: string, batch: ImportBatch, transactions: readonly Transaction[], event: StatementImportEvent): Promise<StatementImport | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows: statements } = await client.query<StatementDb>(`SELECT ${STATEMENT_COLUMNS} FROM statement_imports WHERE user_id=$1 AND id=$2 FOR UPDATE`, [userId, importId]);
      const statement = statements[0];
      if (!statement || statement.status !== 'ready') return null;
      const pending = await client.query(`SELECT 1 FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND decision='needs_review' LIMIT 1`, [userId, importId]);
      if ((pending.rowCount ?? 0) > 0) throw new Error('STATEMENT_REVIEW_REQUIRED');
      await client.query(`INSERT INTO import_batches (id,user_id,account_id,statement_import_id,filename,status,rows_total,rows_imported,rows_duplicate,rows_invalid,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [batch.id,userId,batch.accountId,batch.statementImportId ?? importId,batch.filename,batch.status,batch.rowsTotal,batch.rowsImported,batch.rowsDuplicate,batch.rowsInvalid,batch.createdAt]);
      const inserted = await insertTransactions(client, userId, transactions);
      if (inserted !== transactions.length) {
        throw new Error('STATEMENT_DUPLICATE');
      }
      const { rows: updated } = await client.query<StatementDb>(`UPDATE statement_imports SET status='approved', approved_at=$3, processed_at=COALESCE(processed_at,$3) WHERE user_id=$1 AND id=$2 RETURNING ${STATEMENT_COLUMNS}`, [userId, importId, event.createdAt]);
      await insertEvent(client, userId, event);
      return updated[0] ? toStatement(updated[0]) : null;
    });
  }

  async deleteSource(userId: string, id: string, at: string, event: StatementImportEvent): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(`UPDATE statement_imports SET encrypted_source=NULL, source_deleted_at=$3 WHERE user_id=$1 AND id=$2 AND status <> 'deleted' AND encrypted_source IS NOT NULL`, [userId,id,at]);
      if ((result.rowCount ?? 0) === 0) return false;
      await insertEvent(client, userId, event);
      return true;
    });
  }

  async delete(userId: string, id: string, at: string, event: StatementImportEvent): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(`UPDATE statement_imports SET status='deleted', encrypted_source=NULL, source_deleted_at=$3 WHERE user_id=$1 AND id=$2 AND status <> 'deleted'`, [userId,id,at]);
      if ((result.rowCount ?? 0) === 0) return false;
      await insertEvent(client, userId, event);
      return true;
    });
  }

  async audit(userId: string, id: string): Promise<StatementImportEvent[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<{ id: string; import_id: string; row_id: string | null; kind: string; detail: Record<string, unknown>; created_at: Date }>(`SELECT id, import_id, row_id, kind, detail, created_at FROM statement_import_events WHERE user_id=$1 AND import_id=$2 ORDER BY created_at, id`, [userId,id]);
      return rows.map((row) => ({ id: row.id, importId: row.import_id, rowId: row.row_id, kind: row.kind as StatementImportEvent['kind'], detail: row.detail ?? {}, createdAt: row.created_at.toISOString() }));
    });
  }
}

async function ensureUser(client: PoolClient, userId: string): Promise<void> {
  await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
}

async function assertStatementQuota(client: PoolClient, userId: string, encryptedSource: string, countActive: boolean): Promise<void> {
  // Serialize uploads for one user so two concurrent requests cannot both pass
  // the byte/job budget and commit an over-quota result.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
  const { rows } = await client.query<{ bytes: string | number; active: string | number }>(
    `SELECT COALESCE(sum(octet_length(encrypted_source)), 0) AS bytes,
            count(*) FILTER (WHERE status IN ('queued', 'processing')) AS active
       FROM statement_imports
      WHERE user_id = $1 AND encrypted_source IS NOT NULL`,
    [userId],
  );
  const bytes = Number(rows[0]?.bytes ?? 0);
  const active = Number(rows[0]?.active ?? 0);
  const incoming = Buffer.byteLength(encryptedSource, 'utf8');
  if (bytes + incoming > MAX_STAGED_SOURCE_BYTES || (countActive && active >= MAX_ACTIVE_IMPORTS)) {
    throw new Error('STATEMENT_QUOTA_EXCEEDED');
  }
}

async function getRow(client: PoolClient, userId: string, importId: string, rowId: string, cipher: StatementFileCipher): Promise<StatementRowRecord | null> {
  const { rows } = await client.query<StatementRowDb>(`SELECT ${ROW_COLUMNS} FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND id=$3 FOR UPDATE`, [userId, importId, rowId]);
  return rows[0] ? toRow(rows[0], cipher) : null;
}

async function isReady(client: PoolClient, userId: string, importId: string): Promise<boolean> {
  const { rows } = await client.query<{ status: string }>('SELECT status FROM statement_imports WHERE user_id=$1 AND id=$2 FOR UPDATE', [userId, importId]);
  return rows[0]?.status === 'ready';
}

async function refreshCounts(client: PoolClient, userId: string, importId: string): Promise<void> {
  await client.query(`UPDATE statement_imports SET rows_total=(SELECT count(*) FROM statement_import_rows WHERE user_id=$1 AND import_id=$2), rows_included=(SELECT count(*) FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND decision='include'), rows_excluded=(SELECT count(*) FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND decision='exclude'), rows_needs_review=(SELECT count(*) FROM statement_import_rows WHERE user_id=$1 AND import_id=$2 AND decision='needs_review') WHERE user_id=$1 AND id=$2`, [userId, importId]);
}

async function insertRows(client: PoolClient, userId: string, rows: readonly StatementRowRecord[], cipher: StatementFileCipher): Promise<void> {
  for (const row of rows) {
    const encrypted = encryptRowFields(row, cipher);
    await client.query(`INSERT INTO statement_import_rows (id, import_id, user_id, source_line, posted_at, description, merchant, amount, currency, direction, category_slug, category_source, category_confidence, is_recurring, flags, decision, fingerprint, raw, encrypted_fields, edited_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [row.id,row.importId,userId,row.sourceLine,row.postedAt,encrypted.placeholderDescription,null,row.amount,row.currency,row.direction,row.categorySlug,row.categorySource,row.categoryConfidence,row.isRecurring,row.flags,row.decision,row.fingerprint,encrypted.placeholderRaw,encrypted.payload,row.editedAt]);
  }
}

async function insertEvent(client: PoolClient, userId: string, event: StatementImportEvent): Promise<void> {
  await client.query(`INSERT INTO statement_import_events (id,user_id,import_id,row_id,kind,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [event.id,userId,event.importId,event.rowId,event.kind,event.detail,event.createdAt]);
}

async function insertTransactions(client: PoolClient, userId: string, transactions: readonly Transaction[]): Promise<number> {
  let inserted = 0;
  for (const txn of transactions) {
    const result = await client.query(`INSERT INTO transactions (id,user_id,account_id,provider_txn_id,posted_at,amount,currency,raw_descriptor,normalized_descriptor,merchant,merchant_override,note,excluded_from_analytics,category_slug,category_source,category_confidence,is_recurring,recurring_override,duplicate_reported,pending,tags,import_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ON CONFLICT (user_id,account_id,provider_txn_id) DO NOTHING`, [txn.id,userId,txn.accountId,txn.providerTxnId,txn.postedAt,txn.amount,txn.currency,txn.rawDescriptor,txn.normalizedDescriptor,txn.merchant ?? null,txn.merchantOverride ?? null,txn.note ?? null,txn.excludedFromAnalytics ?? false,txn.categorySlug,txn.categorySource,txn.categoryConfidence,txn.isRecurring,txn.recurringOverride ?? null,txn.duplicateReported ?? false,txn.pending,txn.tags ?? [],txn.importBatchId ?? null]);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

function toStatement(row: StatementDb): StatementImport {
  const details = toDocumentDetails(row.document_details);
  return { id: row.id, accountId: row.account_id, filename: row.filename, mimeType: row.mime_type, format: row.format as StatementImport['format'], statementHash: row.statement_hash, status: row.status as StatementImport['status'], rowsTotal: row.rows_total, rowsIncluded: row.rows_included, rowsExcluded: row.rows_excluded, rowsNeedsReview: row.rows_needs_review, createdAt: row.created_at.toISOString(), processedAt: row.processed_at?.toISOString() ?? null, approvedAt: row.approved_at?.toISOString() ?? null, sourceDeletedAt: row.source_deleted_at?.toISOString() ?? null, error: row.error, ...(details ? { documentDetails: details } : {}) };
}

function toDocumentDetails(value: unknown): NonNullable<StatementImport['documentDetails']> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const details = {
    issuer: typeof candidate.issuer === 'string' ? candidate.issuer : null,
    accountReferenceLast4: typeof candidate.accountReferenceLast4 === 'string' ? candidate.accountReferenceLast4 : null,
    statementDate: typeof candidate.statementDate === 'string' ? candidate.statementDate : null,
    periodStart: typeof candidate.periodStart === 'string' ? candidate.periodStart : null,
    periodEnd: typeof candidate.periodEnd === 'string' ? candidate.periodEnd : null,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
  };
  return Object.values(details).some((item) => item !== null) ? details : undefined;
}

function toRow(row: StatementRowDb, cipher: StatementFileCipher): StatementRowRecord {
  const fields = decryptRowFields(row, cipher);
  return { id: row.id, importId: row.import_id, sourceLine: row.source_line, postedAt: row.posted_at, description: fields.description, merchant: fields.merchant, amount: row.amount, currency: row.currency, direction: row.direction as StatementRowRecord['direction'], categorySlug: row.category_slug, categorySource: row.category_source as StatementRowRecord['categorySource'], categoryConfidence: row.category_confidence, isRecurring: row.is_recurring, flags: [...row.flags], decision: row.decision as StatementRowRecord['decision'], fingerprint: row.fingerprint, raw: fields.raw, editedAt: row.edited_at?.toISOString() ?? null };
}

const ENCRYPTED_ROW_PLACEHOLDER = '[encrypted]';

interface EncryptedRowFields {
  description: string;
  merchant: string | null;
  raw: string;
}

function encryptRowFields(row: Pick<StatementRowRecord, 'description' | 'merchant' | 'raw'>, cipher: StatementFileCipher): { payload: string; placeholderDescription: string; placeholderRaw: string } {
  const fields: EncryptedRowFields = { description: row.description, merchant: row.merchant, raw: row.raw };
  return { payload: cipher.encrypt(JSON.stringify(fields)), placeholderDescription: ENCRYPTED_ROW_PLACEHOLDER, placeholderRaw: ENCRYPTED_ROW_PLACEHOLDER };
}

function decryptRowFields(row: StatementRowDb, cipher: StatementFileCipher): EncryptedRowFields {
  if (!row.encrypted_fields) return { description: row.description, merchant: row.merchant, raw: row.raw };
  const parsed: unknown = JSON.parse(cipher.decrypt(row.encrypted_fields));
  if (!parsed || typeof parsed !== 'object') throw new Error('Statement row ciphertext is invalid.');
  const fields = parsed as Record<string, unknown>;
  if (typeof fields.description !== 'string' || typeof fields.raw !== 'string' || (fields.merchant !== null && typeof fields.merchant !== 'string')) throw new Error('Statement row ciphertext is invalid.');
  return { description: fields.description, merchant: fields.merchant, raw: fields.raw };
}
