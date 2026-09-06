import type {
  StatementImport,
  StatementImportEvent,
  StatementImportJob,
  StatementRowRecord,
} from '../domain/statement-import/types';
import type { ImportBatch, StatementImportStore } from '../ports';
import type { Transaction } from '../domain/types';

interface StoredStatement extends StatementImport {
  encryptedSource: string | null;
  rows: StatementRowRecord[];
  events: StatementImportEvent[];
  attempts: number;
  processingStartedAt: string | null;
  sourceExpiresAt: string | null;
}

const MAX_STAGED_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_IMPORTS = 5;
const SOURCE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** In-memory adapter used by contract tests and the local demo. */
export class InMemoryStatementImportStore implements StatementImportStore {
  constructor(private readonly transactions?: { upsertMany(userId: string, transactions: readonly Transaction[]): Promise<{ inserted: number; updated: number }> }) {}
  private readonly byUser = new Map<string, StoredStatement[]>();

  async list(userId: string): Promise<StatementImport[]> {
    return this.bucket(userId).filter((item) => item.status !== 'deleted').map(strip);
  }

  async get(userId: string, id: string): Promise<StatementImport | null> {
    const found = this.bucket(userId).find((item) => item.id === id && item.status !== 'deleted');
    return found ? strip(found) : null;
  }

  async rows(userId: string, id: string): Promise<StatementRowRecord[]> {
    const found = this.bucket(userId).find((item) => item.id === id && item.status !== 'deleted');
    return found?.rows.map((row) => ({ ...row, flags: [...row.flags] })) ?? [];
  }

  async create(userId: string, statement: StatementImport, encryptedSource: string, rows: readonly StatementRowRecord[]): Promise<StatementImport> {
    const bucket = this.bucket(userId);
    assertQuota(bucket, encryptedSource, false);
    if (bucket.some((item) => item.accountId === statement.accountId && item.statementHash === statement.statementHash && item.status !== 'deleted')) {
      throw new Error('STATEMENT_DUPLICATE');
    }
    const created: StatementImportEvent = { id: `evt_${statement.id}_created`, importId: statement.id, rowId: null, kind: 'created', detail: { format: statement.format, rows: rows.length }, createdAt: statement.createdAt };
    const processed: StatementImportEvent = { id: `evt_${statement.id}_processed`, importId: statement.id, rowId: null, kind: 'processed', detail: { rows: rows.length }, createdAt: statement.processedAt ?? statement.createdAt };
    bucket.push({ ...statement, encryptedSource, rows: rows.map(cloneRow), events: [created, processed], attempts: 0, processingStartedAt: null, sourceExpiresAt: expiry(statement.createdAt) });
    return { ...statement };
  }

  async enqueue(userId: string, statement: StatementImport, encryptedSource: string): Promise<StatementImport> {
    const bucket = this.bucket(userId);
    assertQuota(bucket, encryptedSource, true);
    if (bucket.some((item) => item.accountId === statement.accountId && item.statementHash === statement.statementHash && item.status !== 'deleted')) {
      throw new Error('STATEMENT_DUPLICATE');
    }
    const created: StatementImportEvent = { id: `evt_${statement.id}_created`, importId: statement.id, rowId: null, kind: 'created', detail: { format: statement.format, queued: true }, createdAt: statement.createdAt };
    const stored: StoredStatement = {
      ...statement,
      encryptedSource,
      rows: [],
      events: [created],
      attempts: 0,
      processingStartedAt: null,
      sourceExpiresAt: expiry(statement.createdAt),
    };
    bucket.push(stored);
    return strip(stored);
  }

  async claim(limit: number): Promise<StatementImportJob[]> {
    const now = Date.now();
    const stale = now - 5 * 60_000;
    const candidates = [...this.byUser.entries()]
      .flatMap(([userId, statements]) => statements.map((statement) => ({ userId, statement })))
      .filter(({ statement }) => {
        if (!expireIfNeeded(statement, now)) return false;
        if (statement.status === 'processing' && statement.attempts >= 3 && statement.processingStartedAt !== null && Date.parse(statement.processingStartedAt) < stale) {
          statement.status = 'failed';
          statement.error = 'The statement job exceeded the retry limit.';
          statement.encryptedSource = null;
          statement.sourceDeletedAt = new Date(now).toISOString();
          statement.sourceExpiresAt = null;
          statement.processingStartedAt = null;
          statement.events.push({ id: `evt_retry_exhausted_${statement.id}`, importId: statement.id, rowId: null, kind: 'failed', detail: { reason: 'retry_limit' }, createdAt: statement.sourceDeletedAt });
          return false;
        }
        return true;
      })
      .filter(({ statement }) =>
        (statement.status === 'queued' && statement.encryptedSource !== null) ||
        (statement.status === 'processing' && statement.processingStartedAt !== null && Date.parse(statement.processingStartedAt) < stale),
      )
      .sort((left, right) => left.statement.createdAt.localeCompare(right.statement.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
    return candidates.map(({ userId, statement }) => {
      statement.status = 'processing';
      statement.processingStartedAt = new Date(now).toISOString();
      statement.attempts += 1;
      return { id: statement.id, userId, accountId: statement.accountId, attempts: statement.attempts };
    });
  }

  async source(userId: string, importId: string): Promise<{ statement: StatementImport; encryptedSource: string } | null> {
    const statement = this.find(userId, importId);
    if (!statement || statement.status !== 'processing' || !statement.encryptedSource) return null;
    return { statement: strip(statement), encryptedSource: statement.encryptedSource };
  }

  async completeProcessing(userId: string, importId: string, rows: readonly StatementRowRecord[], processedAt: string, event: StatementImportEvent): Promise<StatementImport | null> {
    const statement = this.find(userId, importId);
    if (!statement || statement.status !== 'processing') return null;
    statement.rows = rows.map(cloneRow);
    statement.status = 'ready';
    statement.processedAt = processedAt;
    statement.error = null;
    statement.processingStartedAt = null;
    recalculate(statement);
    statement.events.push(cloneEvent(event));
    return strip(statement);
  }

  async failProcessing(userId: string, importId: string, error: string, at: string, event: StatementImportEvent): Promise<boolean> {
    const statement = this.find(userId, importId);
    if (!statement || statement.status !== 'processing') return false;
    statement.status = 'failed';
    statement.error = error.slice(0, 500);
    statement.processingStartedAt = null;
    statement.processedAt = at;
    statement.events.push(cloneEvent(event));
    return true;
  }

  async updateRow(userId: string, importId: string, rowId: string, patch: Partial<StatementRowRecord>, event: StatementImportEvent): Promise<StatementRowRecord | null> {
    const statement = this.find(userId, importId);
    const row = statement?.rows.find((candidate) => candidate.id === rowId);
    if (!statement || !row || statement.status !== 'ready') return null;
    Object.assign(row, patch, { id: row.id, importId: statement.id, editedAt: event.createdAt });
    recalculate(statement);
    statement.events.push(cloneEvent(event));
    return cloneRow(row);
  }

  async splitRow(userId: string, importId: string, rowId: string, parts: readonly StatementRowRecord[], event: StatementImportEvent): Promise<StatementRowRecord[] | null> {
    const statement = this.find(userId, importId);
    const index = statement?.rows.findIndex((candidate) => candidate.id === rowId) ?? -1;
    if (!statement || index < 0 || statement.status !== 'ready') return null;
    statement.rows[index] = { ...statement.rows[index]!, decision: 'exclude', flags: [...statement.rows[index]!.flags, 'split_parent'], editedAt: event.createdAt };
    statement.rows.push(...parts.map(cloneRow));
    recalculate(statement);
    statement.events.push(cloneEvent(event));
    return parts.map(cloneRow);
  }

  async mergeRows(userId: string, importId: string, rowIds: readonly string[], merged: StatementRowRecord, event: StatementImportEvent): Promise<StatementRowRecord | null> {
    const statement = this.find(userId, importId);
    if (!statement || statement.status !== 'ready' || rowIds.length < 2) return null;
    const ids = new Set(rowIds);
    const selected = statement.rows.filter((row) => ids.has(row.id));
    if (selected.length !== rowIds.length) return null;
    statement.rows = statement.rows.map((row) => ids.has(row.id)
      ? { ...row, decision: 'exclude', flags: [...row.flags, 'merged_parent'], editedAt: event.createdAt }
      : row);
    statement.rows.push(cloneRow(merged));
    recalculate(statement);
    statement.events.push(cloneEvent(event));
    return cloneRow(merged);
  }

  async finalize(userId: string, importId: string, _batch: ImportBatch, _transactions: readonly Transaction[], event: StatementImportEvent): Promise<StatementImport | null> {
    const statement = this.find(userId, importId);
    if (!statement || statement.status !== 'ready') return null;
    if (this.transactions) await this.transactions.upsertMany(userId, _transactions);
    statement.status = 'approved';
    statement.processingStartedAt = null;
    statement.approvedAt = event.createdAt;
    statement.events.push(cloneEvent(event));
    return strip(statement);
  }

  async deleteSource(userId: string, id: string, at: string, event: StatementImportEvent): Promise<boolean> {
    const statement = this.find(userId, id);
    if (!statement || statement.status === 'deleted') return false;
    statement.encryptedSource = null;
    statement.sourceDeletedAt = at;
    statement.events.push(cloneEvent(event));
    return true;
  }

  async delete(userId: string, id: string, at: string, event: StatementImportEvent): Promise<boolean> {
    const statement = this.find(userId, id);
    if (!statement || statement.status === 'deleted') return false;
    statement.status = 'deleted';
    statement.processingStartedAt = null;
    statement.sourceDeletedAt = at;
    statement.events.push(cloneEvent({ ...event, createdAt: at }));
    return true;
  }

  async audit(userId: string, id: string): Promise<StatementImportEvent[]> {
    return this.find(userId, id)?.events.map(cloneEvent) ?? [];
  }

  purgeUser(userId: string): void { this.byUser.delete(userId); }

  private bucket(userId: string): StoredStatement[] {
    let bucket = this.byUser.get(userId);
    if (!bucket) { bucket = []; this.byUser.set(userId, bucket); }
    return bucket;
  }

  private find(userId: string, id: string): StoredStatement | undefined {
    return this.bucket(userId).find((item) => item.id === id);
  }
}

function recalculate(statement: StoredStatement): void {
  statement.rowsTotal = statement.rows.length;
  statement.rowsIncluded = statement.rows.filter((row) => row.decision === 'include').length;
  statement.rowsExcluded = statement.rows.filter((row) => row.decision === 'exclude').length;
  statement.rowsNeedsReview = statement.rows.filter((row) => row.decision === 'needs_review').length;
}

function strip(statement: StoredStatement): StatementImport {
  const { encryptedSource: _source, rows: _rows, events: _events, sourceExpiresAt: _sourceExpiresAt, ...publicRecord } = statement;
  return { ...publicRecord };
}

function cloneRow(row: StatementRowRecord): StatementRowRecord {
  return { ...row, flags: [...row.flags] };
}

function cloneEvent(event: StatementImportEvent): StatementImportEvent {
  return { ...event, detail: { ...event.detail } };
}

function assertQuota(bucket: readonly StoredStatement[], encryptedSource: string, countActive: boolean): void {
  const bytes = bucket.reduce((sum, statement) => sum + (statement.encryptedSource ? Buffer.byteLength(statement.encryptedSource, 'utf8') : 0), 0);
  const active = bucket.filter((statement) => statement.status === 'queued' || statement.status === 'processing').length;
  if (bytes + Buffer.byteLength(encryptedSource, 'utf8') > MAX_STAGED_SOURCE_BYTES || (countActive && active >= MAX_ACTIVE_IMPORTS)) {
    throw new Error('STATEMENT_QUOTA_EXCEEDED');
  }
}

function expiry(createdAt: string): string {
  return new Date(Date.parse(createdAt) + SOURCE_RETENTION_MS).toISOString();
}

function expireIfNeeded(statement: StoredStatement, now: number): boolean {
  if (!statement.encryptedSource || !statement.sourceExpiresAt || Date.parse(statement.sourceExpiresAt) > now) return true;
  statement.encryptedSource = null;
  statement.sourceDeletedAt = new Date(now).toISOString();
  statement.sourceExpiresAt = null;
  statement.events.push({ id: `evt_source_expired_${statement.id}`, importId: statement.id, rowId: null, kind: 'source_deleted', detail: { reason: 'retention_expired' }, createdAt: statement.sourceDeletedAt });
  if (statement.status === 'queued' || statement.status === 'processing') {
    statement.status = 'failed';
    statement.error = 'The encrypted source retention period expired.';
    statement.processingStartedAt = null;
    statement.processedAt = statement.sourceDeletedAt;
  }
  return false;
}
