import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { TRANSACTION_STORE, type TransactionStore } from '../../ports';
import {
  RECEIPT_OCR_PROVIDER,
  RECEIPT_STORE,
  type ReceiptOcrProvider,
  type ReceiptRecord,
  type ReceiptStore,
} from '../../ports/receipts';
import type { ReceiptScan } from '../../domain/receipts/parse';
import { CLOCK, type ClockPort } from '../../ports';

@Injectable()
export class ReceiptsService {
  constructor(
    @Inject(RECEIPT_OCR_PROVIDER) private readonly ocr: ReceiptOcrProvider,
    @Inject(RECEIPT_STORE) private readonly receipts: ReceiptStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  get providerConfigured(): boolean {
    return this.ocr.configured;
  }

  /** Recognise without persisting — a draft for the user to confirm. */
  async scan(text: string): Promise<ReceiptScan> {
    return this.ocr.recognize(text);
  }

  /**
   * Recognise, verify the transaction belongs to the user, then persist. One
   * receipt per transaction; re-scanning replaces the stored one.
   */
  async attach(
    userId: string,
    transactionId: string,
    text: string,
  ): Promise<ReceiptRecord> {
    const transaction = await this.transactions.get(userId, transactionId);
    if (!transaction) throw new NotFoundException('No such transaction.');

    const scan = await this.ocr.recognize(text);
    const existing = await this.receipts.getByTransaction(userId, transactionId);
    const record: ReceiptRecord = {
      id: existing?.id ?? randomUUID(),
      userId,
      transactionId,
      merchant: scan.merchant,
      receiptDate: scan.date,
      totalMinor: scan.totalMinor,
      taxMinor: scan.taxMinor,
      currency: scan.currency,
      items: scan.items,
      text,
      createdAt: existing?.createdAt ?? this.clock.now().toISOString(),
    };
    return this.receipts.upsert(userId, record);
  }

  async getForTransaction(
    userId: string,
    transactionId: string,
  ): Promise<ReceiptRecord> {
    const record = await this.receipts.getByTransaction(userId, transactionId);
    if (!record) throw new NotFoundException('No receipt for this transaction.');
    return record;
  }
}
