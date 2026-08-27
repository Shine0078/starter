import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { isKnownCategory } from '../../domain/categories';
import { categorizeDescriptor, ruleFromCorrection } from '../../domain/categorization/categorize';
import { normalizeDescriptor } from '../../domain/categorization/normalize';
import { analyzeStatement } from '../../domain/statement-import/analyze';
import { summarizeStatementRows } from '../../domain/statement-import/summary';
import type { StatementImport, StatementImportEvent, StatementRowDraft, StatementRowRecord } from '../../domain/statement-import/types';
import type { Transaction } from '../../domain/types';
import {
  ACCOUNT_STORE, CLOCK, RULE_STORE, STATEMENT_FILE_CIPHER, STATEMENT_IMPORT_STORE, TRANSACTION_STORE,
  type AccountStore, type ClockPort, type ImportBatch, type RuleStore, type StatementFileCipher,
  type StatementImportStore, type TransactionStore,
} from '../../ports';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME = 260;

export interface CreateStatementInput {
  accountId?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  contentBase64?: unknown;
}

export interface EditStatementRowInput {
  postedAt?: unknown;
  description?: unknown;
  merchant?: unknown;
  amount?: unknown;
  currency?: unknown;
  categorySlug?: unknown;
  isRecurring?: unknown;
  decision?: unknown;
}

@Injectable()
export class StatementImportService {
  constructor(
    @Inject(STATEMENT_IMPORT_STORE) private readonly imports: StatementImportStore,
    @Inject(STATEMENT_FILE_CIPHER) private readonly cipher: StatementFileCipher,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(RULE_STORE) private readonly rules: RuleStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async create(userId: string, input: CreateStatementInput): Promise<{ statement: StatementImport; rows: StatementRowRecord[]; warnings: string[] }> {
    const accountId = stringField(input.accountId, 'accountId', 1, 120);
    const filename = stringField(input.filename, 'filename', 1, MAX_FILENAME);
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : 'application/octet-stream';
    const encoded = stringField(input.contentBase64, 'contentBase64', 1, Math.ceil(MAX_BYTES * 4 / 3) + 32);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw new BadRequestException('contentBase64 must be valid base64.');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new BadRequestException('Statement files must be between 1 byte and 10 MB.');
    const account = await this.accounts.get(userId, accountId);
    if (!account) throw new NotFoundException('No such account.');
    const existing = await this.transactions.list(userId, { accountId });
    const rules = await this.rules.list(userId);
    let extraction;
    try {
      extraction = await analyzeStatement({ filename, mimeType, bytes, currency: account.currency, existing, rules });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Could not process this statement.');
    }
    const id = randomUUID();
    const rows = this.decorateRows(id, extraction.rows, existing);
    const now = this.clock.now().toISOString();
    const statement: StatementImport = {
      id, accountId, filename, mimeType, format: extraction.format, statementHash: extraction.statementHash,
      status: 'ready', rowsTotal: rows.length, rowsIncluded: rows.filter((row) => row.decision === 'include').length,
      rowsExcluded: rows.filter((row) => row.decision === 'exclude').length,
      rowsNeedsReview: rows.filter((row) => row.decision === 'needs_review').length,
      createdAt: now, processedAt: now, approvedAt: null, sourceDeletedAt: null, error: null,
    };
    try {
      await this.imports.create(userId, statement, this.cipher.encrypt(encoded), rows);
    } catch (error) {
      if (error instanceof Error && error.message === 'STATEMENT_DUPLICATE') throw new ConflictException('This statement has already been imported for this account.');
      throw error;
    }
    return { statement, rows, warnings: extraction.warnings };
  }

  list(userId: string): Promise<StatementImport[]> { return this.imports.list(userId); }

  async get(userId: string, id: string): Promise<{ statement: StatementImport; rows: StatementRowRecord[] }> {
    const statement = await this.imports.get(userId, id);
    if (!statement) throw new NotFoundException('Statement import not found.');
    return { statement, rows: await this.imports.rows(userId, id) };
  }

  async editRow(userId: string, importId: string, rowId: string, input: EditStatementRowInput): Promise<StatementRowRecord> {
    const current = await this.findRow(userId, importId, rowId);
    const patch: Partial<StatementRowRecord> = {};
    if (input.postedAt !== undefined) {
      if (typeof input.postedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.postedAt) || Number.isNaN(Date.parse(`${input.postedAt}T00:00:00Z`))) throw new BadRequestException('postedAt must be YYYY-MM-DD.');
      patch.postedAt = input.postedAt;
    }
    if (input.description !== undefined) {
      if (typeof input.description !== 'string' || input.description.trim().length === 0 || input.description.length > 500) throw new BadRequestException('description must be 1 through 500 characters.');
      patch.description = input.description.trim();
      patch.merchant = current.merchant;
    }
    if (input.merchant !== undefined) {
      if (input.merchant !== null && (typeof input.merchant !== 'string' || input.merchant.length > 160)) throw new BadRequestException('merchant is too long.');
      patch.merchant = typeof input.merchant === 'string' ? input.merchant.trim() : null;
    }
    if (input.amount !== undefined) {
      if (!Number.isSafeInteger(input.amount) || (input.amount as number) === 0) throw new BadRequestException('amount must be a non-zero minor-unit integer.');
      patch.amount = input.amount as number;
      patch.direction = (input.amount as number) < 0 ? 'debit' : 'credit';
    }
    if (input.currency !== undefined) {
      if (typeof input.currency !== 'string' || !/^[A-Za-z]{3}$/.test(input.currency)) throw new BadRequestException('currency must be a 3-letter ISO code.');
      patch.currency = input.currency.toUpperCase();
    }
    if (input.categorySlug !== undefined) {
      if (typeof input.categorySlug !== 'string' || !isKnownCategory(input.categorySlug)) throw new BadRequestException('Unknown category.');
      patch.categorySlug = input.categorySlug;
      patch.categorySource = 'user_manual';
      patch.categoryConfidence = 1;
    }
    if (input.isRecurring !== undefined) {
      if (typeof input.isRecurring !== 'boolean') throw new BadRequestException('isRecurring must be boolean.');
      patch.isRecurring = input.isRecurring;
    }
    if (input.decision !== undefined) {
      if (input.decision !== 'include' && input.decision !== 'exclude' && input.decision !== 'needs_review') throw new BadRequestException('decision must be include, exclude, or needs_review.');
      patch.decision = input.decision;
    }
    const next = { ...current, ...patch };
    patch.fingerprint = fingerprint(next);
    const event = this.event(importId, rowId, 'row_edited', { fields: Object.keys(patch) });
    const updated = await this.imports.updateRow(userId, importId, rowId, patch, event);
    if (!updated) throw new NotFoundException('Statement row is not editable.');
    return updated;
  }

  async splitRow(userId: string, importId: string, rowId: string, input: { parts?: unknown }): Promise<StatementRowRecord[]> {
    const current = await this.findRow(userId, importId, rowId);
    if (!Array.isArray(input.parts) || input.parts.length < 2 || input.parts.length > 10 || current.amount === null) throw new BadRequestException('Provide between 2 and 10 parts for a valid transaction.');
    const parts = input.parts.map((part, index) => {
      if (!part || typeof part !== 'object') throw new BadRequestException('Each split part must be an object.');
      const value = part as { amount?: unknown; categorySlug?: unknown; description?: unknown };
      if (!Number.isSafeInteger(value.amount) || value.amount === 0) throw new BadRequestException('Split amounts must be non-zero minor-unit integers.');
      const category = typeof value.categorySlug === 'string' && isKnownCategory(value.categorySlug) ? value.categorySlug : current.categorySlug;
      const description = typeof value.description === 'string' && value.description.trim() ? value.description.trim().slice(0, 500) : `${current.description} (${index + 1})`;
      const row: StatementRowRecord = { ...current, id: `${current.id}_part_${index + 1}`, description, amount: value.amount as number, merchant: current.merchant, categorySlug: category, categorySource: 'user_manual', categoryConfidence: 1, direction: (value.amount as number) < 0 ? 'debit' : 'credit', decision: 'include', flags: ['split_child'], editedAt: this.clock.now().toISOString(), fingerprint: '' };
      row.fingerprint = fingerprint(row);
      return row;
    });
    if (parts.reduce((sum, part) => sum + (part.amount ?? 0), 0) !== current.amount) throw new BadRequestException('Split parts must add up exactly to the original amount.');
    const updated = await this.imports.splitRow(userId, importId, rowId, parts, this.event(importId, rowId, 'row_split', { parts: parts.length }));
    if (!updated) throw new NotFoundException('Statement row is not editable.');
    return updated;
  }

  async mergeRows(userId: string, importId: string, input: { rowIds?: unknown }): Promise<StatementRowRecord> {
    if (!Array.isArray(input.rowIds) || input.rowIds.length < 2 || input.rowIds.length > 10 || input.rowIds.some((value) => typeof value !== 'string')) throw new BadRequestException('Provide between 2 and 10 row ids.');
    const rows = await this.imports.rows(userId, importId);
    const wanted = rows.filter((row) => (input.rowIds as string[]).includes(row.id));
    if (wanted.length !== input.rowIds.length || wanted.some((row) => row.amount === null)) throw new BadRequestException('All merge rows must exist and have amounts.');
    const first = wanted[0]!;
    const merged: StatementRowRecord = { ...first, id: `${first.id}_merged_${randomUUID()}`, description: wanted.map((row) => row.description).join(' + ').slice(0, 500), amount: wanted.reduce((sum, row) => sum + (row.amount ?? 0), 0), categorySource: 'user_manual', categoryConfidence: 1, flags: ['merged_row'], decision: 'include', editedAt: this.clock.now().toISOString(), fingerprint: '' };
    merged.fingerprint = fingerprint(merged);
    const result = await this.imports.mergeRows(userId, importId, input.rowIds as string[], merged, this.event(importId, null, 'rows_merged', { rows: input.rowIds }));
    if (!result) throw new NotFoundException('Statement rows are not editable.');
    return result;
  }

  async approve(userId: string, importId: string): Promise<StatementImport> {
    const found = await this.get(userId, importId);
    if (found.statement.status !== 'ready') throw new ConflictException('This statement is no longer awaiting approval.');
    if (found.rows.some((row) => row.decision === 'needs_review')) throw new BadRequestException('Review or exclude every flagged row before approval.');
    const included = found.rows.filter((row) => row.decision === 'include' && row.amount !== null && row.postedAt);
    if (included.length === 0) throw new BadRequestException('There are no included transactions to approve.');
    const existing = await this.transactions.list(userId, { accountId: found.statement.accountId });
    const existingProviderIds = new Set(existing.map((transaction) => transaction.providerTxnId));
    const alreadyPersisted = included.filter((row) => existingProviderIds.has(`manual_${row.fingerprint}`));
    if (alreadyPersisted.length > 0) {
      throw new ConflictException('One or more included rows already exist in this account. Exclude them to prevent a duplicate ledger entry.');
    }
    const batchId = randomUUID();
    const transactions: Transaction[] = included.map((row) => ({
      id: `stmt_${importId}_${row.id}`, accountId: found.statement.accountId, providerTxnId: `manual_${row.fingerprint}`,
      postedAt: row.postedAt!, amount: row.amount!, currency: row.currency, rawDescriptor: row.description,
      normalizedDescriptor: normalizeDescriptor(row.description), merchant: row.merchant ?? undefined,
      categorySlug: row.categorySlug, categorySource: row.categorySource, categoryConfidence: row.categoryConfidence,
      isRecurring: row.isRecurring, pending: false, importBatchId: batchId,
    }));
    const batch: ImportBatch = { id: batchId, accountId: found.statement.accountId, filename: found.statement.filename, status: 'committed', rowsTotal: found.rows.length, rowsImported: transactions.length, rowsDuplicate: found.rows.filter((row) => row.flags.includes('possible_duplicate')).length, rowsInvalid: found.rows.filter((row) => row.flags.includes('extraction_error')).length, createdAt: this.clock.now().toISOString(), revertedAt: null };
    const result = await this.imports.finalize(userId, importId, batch, transactions, this.event(importId, null, 'approved', { rows: transactions.length }));
    if (!result) throw new ConflictException('This statement is no longer awaiting approval.');
    for (const row of included.filter((candidate) => candidate.categorySource === 'user_manual')) {
      try { await this.rules.create(userId, ruleFromCorrection(row.description, row.categorySlug, randomUUID())); } catch { /* a duplicate correction does not invalidate an approved import */ }
    }
    return result;
  }

  async deleteSource(userId: string, id: string): Promise<void> {
    const ok = await this.imports.deleteSource(userId, id, this.clock.now().toISOString(), this.event(id, null, 'source_deleted', {}));
    if (!ok) throw new NotFoundException('Source already deleted or statement not found.');
  }

  async delete(userId: string, id: string): Promise<void> {
    const ok = await this.imports.delete(userId, id, this.clock.now().toISOString(), this.event(id, null, 'deleted', {}));
    if (!ok) throw new NotFoundException('Statement import not found.');
  }

  audit(userId: string, id: string): Promise<StatementImportEvent[]> { return this.imports.audit(userId, id); }

  async summary(userId: string, id: string) {
    const found = await this.get(userId, id);
    return summarizeStatementRows(found.rows);
  }

  private async findRow(userId: string, importId: string, rowId: string): Promise<StatementRowRecord> {
    const row = (await this.imports.rows(userId, importId)).find((candidate) => candidate.id === rowId);
    if (!row) throw new NotFoundException('Statement row not found.');
    return row;
  }

  private decorateRows(importId: string, rows: readonly StatementRowDraft[], existing: readonly Transaction[]): StatementRowRecord[] {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(normalizeDescriptor(row.description), (counts.get(normalizeDescriptor(row.description)) ?? 0) + 1);
    return rows.map((row) => {
      const flags = [...row.flags];
      const key = normalizeDescriptor(row.description);
      const recurring = (counts.get(key) ?? 0) > 1 || existing.filter((txn) => normalizeDescriptor(txn.rawDescriptor) === key && txn.amount === row.amount).length > 0;
      if (recurring && !flags.includes('recurring_payment')) flags.push('recurring_payment');
      if ((row.categorySlug === 'transfer' || row.categorySlug === 'savings' || row.categorySlug === 'investments') && !flags.includes('internal_transfer')) flags.push('internal_transfer');
      if ((row.categorySlug === 'refunds' || /\brefund\b|\breversal\b/i.test(row.description)) && !flags.includes('refund')) flags.push('refund');
      if (row.amount !== null && Math.abs(row.amount) > 500_000 && !flags.includes('unusual_spending')) flags.push('unusual_spending');
      return { ...row, id: `${importId}_row_${row.sourceLine}_${randomUUID().slice(0, 8)}`, importId, isRecurring: recurring || row.isRecurring, flags: flags.slice(0, 8), decision: flags.length > 0 ? 'needs_review' : row.decision, editedAt: null };
    });
  }

  private event(importId: string, rowId: string | null, kind: StatementImportEvent['kind'], detail: Record<string, unknown>): StatementImportEvent {
    return { id: randomUUID(), importId, rowId, kind, detail, createdAt: this.clock.now().toISOString() };
  }
}

function stringField(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new BadRequestException(`${field} must be between ${min} and ${max} characters.`);
  return value.trim();
}

function fingerprint(row: Pick<StatementRowRecord, 'sourceLine' | 'postedAt' | 'amount' | 'description' | 'currency'>): string {
  return createHash('sha256').update(`${row.sourceLine}|${row.postedAt ?? ''}|${row.amount ?? ''}|${normalizeDescriptor(row.description)}|${row.currency}`).digest('hex');
}
