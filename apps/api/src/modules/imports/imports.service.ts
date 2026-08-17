import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { categorizeDescriptor } from '../../domain/categorization/categorize';
import { parseCsv } from '../../domain/imports/csv-parse';
import { suggestMapping, type ColumnMapping } from '../../domain/imports/mapping';
import { reviewImport, type ImportReview } from '../../domain/imports/review';
import type { Transaction } from '../../domain/types';
import {
  ACCOUNT_STORE,
  CLOCK,
  IMPORT_BATCH_STORE,
  RULE_STORE,
  TRANSACTION_STORE,
  type AccountStore,
  type ClockPort,
  type ImportBatch,
  type ImportBatchStore,
  type RuleStore,
  type TransactionStore,
} from '../../ports';

export interface PreviewInput {
  accountId: string;
  filename: string;
  content: string;
  mapping?: ColumnMapping;
}

export interface CommitInput extends PreviewInput {
  mapping: ColumnMapping;
}

/** 2 MB of CSV is roughly 20,000 rows — well past the row limit already enforced. */
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

@Injectable()
export class ImportsService {
  constructor(
    @Inject(IMPORT_BATCH_STORE) private readonly batches: ImportBatchStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(RULE_STORE) private readonly rules: RuleStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * Parses, maps, and classifies without writing anything.
   *
   * This is the whole point of the feature: a user sees exactly what would be
   * imported, what looks like a duplicate, and what could not be read, before
   * any of it reaches the ledger.
   */
  async preview(
    userId: string,
    input: PreviewInput,
  ): Promise<{
    mapping: ColumnMapping | null;
    warnings: string[];
    matched: Record<string, string>;
    headers: string[];
    review: ImportReview | null;
  }> {
    const account = await this.requireAccount(userId, input.accountId);
    this.assertSize(input.content);

    const parsed = parseCsv(input.content);
    const suggestion = suggestMapping(parsed.headers, parsed.rows.slice(0, 25));
    const mapping = input.mapping ?? suggestion.mapping;

    if (!mapping) {
      // No usable mapping. Return the headers so the client can ask the user to
      // choose columns rather than failing with nothing actionable.
      return {
        mapping: null,
        warnings: suggestion.warnings,
        matched: suggestion.matched,
        headers: parsed.headers,
        review: null,
      };
    }

    const existing = await this.transactions.list(userId, { accountId: account.id });

    return {
      mapping,
      warnings: suggestion.warnings,
      matched: suggestion.matched,
      headers: parsed.headers,
      review: reviewImport({
        headers: parsed.headers,
        rows: parsed.rows,
        mapping,
        existing,
        currency: account.currency,
        raggedLines: parsed.raggedLines,
      }),
    };
  }

  /**
   * Imports the rows the review marked importable, and nothing else.
   *
   * Duplicates and invalid rows are counted for the record but never written —
   * the user already saw them classified, and committing them anyway would make
   * the preview a lie.
   */
  async commit(userId: string, input: CommitInput): Promise<ImportBatch> {
    const account = await this.requireAccount(userId, input.accountId);
    this.assertSize(input.content);

    const parsed = parseCsv(input.content);
    const existing = await this.transactions.list(userId, { accountId: account.id });

    const review = reviewImport({
      headers: parsed.headers,
      rows: parsed.rows,
      mapping: input.mapping,
      existing,
      currency: account.currency,
      raggedLines: parsed.raggedLines,
    });

    const importable = review.rows.filter((row) => row.decision === 'import');
    if (importable.length === 0) {
      throw new BadRequestException('Nothing in this file is importable.');
    }

    const batchId = randomUUID();
    const rules = await this.rules.list(userId);

    const transactions: Transaction[] = importable.map((row) => {
      const categorization = categorizeDescriptor(row.descriptor!, { rules });

      return {
        // Derived from the file's own content, so re-importing the same file
        // collides on the unique index instead of duplicating the ledger even
        // if the review is bypassed.
        id: `imp_${batchId}_${row.line}`,
        accountId: account.id,
        providerTxnId: `csv_${fingerprint(account.id, row.postedAt!, row.amount!, row.descriptor!)}`,
        postedAt: row.postedAt!,
        amount: row.amount!,
        currency: account.currency,
        rawDescriptor: row.descriptor!,
        normalizedDescriptor: row.normalizedDescriptor!,
        merchant: categorization.merchant,
        categorySlug: categorization.categorySlug,
        categorySource: categorization.source,
        categoryConfidence: categorization.confidence,
        isRecurring: false,
        pending: false,
        importBatchId: batchId,
      };
    });

    const batch: ImportBatch = {
      id: batchId,
      accountId: account.id,
      filename: input.filename.slice(0, 260),
      status: 'committed',
      rowsTotal: review.summary.total,
      rowsImported: importable.length,
      rowsDuplicate: review.summary.duplicates,
      rowsInvalid: review.summary.invalid,
      createdAt: this.clock.now().toISOString(),
      revertedAt: null,
    };

    return this.batches.commit(userId, batch, transactions);
  }

  list(userId: string): Promise<ImportBatch[]> {
    return this.batches.list(userId);
  }

  /** Undoes an import. Only rows carrying this batch id are removed. */
  async revert(userId: string, id: string): Promise<{ removed: number }> {
    const removed = await this.batches.revert(userId, id, this.clock.now().toISOString());
    if (removed === null) {
      throw new NotFoundException('No such import, or it has already been undone.');
    }
    return { removed };
  }

  private async requireAccount(userId: string, accountId: string) {
    const account = await this.accounts.get(userId, accountId);
    if (!account) throw new NotFoundException('No such account.');
    return account;
  }

  private assertSize(content: string): void {
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      throw new BadRequestException('That file is too large. Split it by date range.');
    }
  }
}

/**
 * A stable id for a CSV row.
 *
 * The file has no transaction identifier, so one is derived from the facts that
 * identify it. Re-uploading the same statement therefore collides on the
 * existing unique index rather than doubling the ledger.
 */
function fingerprint(
  accountId: string,
  postedAt: string,
  amount: number,
  descriptor: string,
): string {
  return createHash('sha256')
    .update(`${accountId}|${postedAt}|${amount}|${descriptor}`)
    .digest('hex')
    .slice(0, 32);
}
