import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';

import { BadRequestException, Delete } from '@nestjs/common';

import { loadConfig } from '../../config';
import { transactionsToCsv } from '../../domain/exports/transactions-csv';
import { formatMoney, money } from '../../domain/money';
import type { Transaction } from '../../domain/types';
import { CurrentUser } from '../auth/auth.guard';
import { LedgerService } from './ledger.service';

/** Adds a display string alongside the integer. The client never does money
 *  math on the formatted value â€” it is for rendering only (ADR-0003). */
function present(txn: Transaction) {
  return {
    ...txn,
    amountFormatted: formatMoney(money(txn.amount, txn.currency)),
  };
}

function presentAccount(account: Awaited<ReturnType<LedgerService['listAccounts']>>[number]) {
  return {
    ...account,
    source: account.source ?? 'provider',
    balanceFormatted: formatMoney(money(account.balanceCurrent, account.currency)),
    utilization:
      account.type === 'credit_card' && account.creditLimit
        ? Math.max(0, -account.balanceCurrent) / account.creditLimit
        : null,
  };
}

/**
 * Account kinds a user can enter by hand.
 *
 * `credit_card` belongs here even though it is the one type an aggregator
 * normally supplies: the whole credit-card surface — utilisation, the pay-down
 * target, the safe payment window — is useless to anyone who has not connected
 * a bank, and connecting a bank is gated on a commercial agreement. Leaving it
 * out meant "add your credit card" had no answer at all.
 */
const MANUAL_TYPES = new Set([
  'cash',
  'checking',
  'savings',
  'investment',
  'loan',
  'credit_card',
]);

/** Balances that are money owed rather than money held. */
const LIABILITY_TYPES = new Set(['loan', 'credit_card']);

type ManualAccountBody = {
  name?: unknown;
  type?: unknown;
  currency?: unknown;
  balanceCurrent?: unknown;
  creditLimit?: unknown;
  statementDay?: unknown;
  paymentDueDay?: unknown;
};

/** Optional whole number in an inclusive range, or undefined. */
function optionalInt(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new BadRequestException(`${field} must be a whole number from ${min} through ${max}`);
  }
  return value as number;
}

function manualAccountDetails(body: ManualAccountBody) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';
  const balance = body.balanceCurrent;
  if (name.length < 1 || name.length > 80) {
    throw new BadRequestException('name must be from 1 through 80 characters');
  }
  if (!MANUAL_TYPES.has(type)) {
    throw new BadRequestException(
      `type must be one of ${[...MANUAL_TYPES].join(', ')}`,
    );
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException('currency must be a 3-letter ISO code');
  }
  if (!Number.isSafeInteger(balance) || Math.abs(balance as number) > 10_000_000_000_000) {
    throw new BadRequestException('balanceCurrent must be a safe minor-unit integer');
  }

  // Sign carries meaning throughout the domain: negative is money owed
  // (ADR-0003). A credit card entered as a positive balance would count as an
  // asset and inflate net position by twice the debt.
  const isLiability = LIABILITY_TYPES.has(type);
  if (isLiability && (balance as number) > 0) {
    throw new BadRequestException(
      `a ${type === 'loan' ? 'loan' : 'credit card'} balance must be zero or negative`,
    );
  }
  if (!isLiability && (balance as number) < 0) {
    throw new BadRequestException('an asset balance must be zero or positive');
  }

  const creditLimit = optionalInt(body.creditLimit, 'creditLimit', 0, 10_000_000_000_000);
  const statementDay = optionalInt(body.statementDay, 'statementDay', 1, 31);
  const paymentDueDay = optionalInt(body.paymentDueDay, 'paymentDueDay', 1, 31);

  if (type !== 'credit_card' && (creditLimit !== undefined || statementDay !== undefined || paymentDueDay !== undefined)) {
    throw new BadRequestException(
      'creditLimit, statementDay and paymentDueDay apply only to a credit_card',
    );
  }

  return {
    name,
    type: type as 'cash' | 'checking' | 'savings' | 'investment' | 'loan' | 'credit_card',
    currency,
    balanceCurrent: balance as number,
    ...(creditLimit === undefined ? {} : { creditLimit }),
    ...(statementDay === undefined ? {} : { statementDay }),
    ...(paymentDueDay === undefined ? {} : { paymentDueDay }),
  };
}

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('sync')
  sync(@CurrentUser() userId: string) {
    if (loadConfig().isProduction) {
      throw new BadRequestException('Development sample sync is disabled. Connect a bank account.');
    }
    return this.ledger.sync(userId);
  }

  @Get('accounts')
  async accounts(@CurrentUser() userId: string) {
    const accounts = await this.ledger.listAccounts(userId);
    return accounts.map(presentAccount);
  }

  @Post('accounts/manual')
  async createManualAccount(
    @CurrentUser() userId: string,
    @Body() body: ManualAccountBody,
  ) {
    return presentAccount(
      await this.ledger.createManualAccount(userId, manualAccountDetails(body)),
    );
  }

  @Patch('accounts/manual/:id')
  async updateManualAccount(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: ManualAccountBody,
  ) {
    return presentAccount(
      await this.ledger.updateManualAccount(userId, id, manualAccountDetails(body)),
    );
  }

  @Delete('accounts/manual/:id')
  async removeManualAccount(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    await this.ledger.removeManualAccount(userId, id);
    return { removed: true };
  }

  @Get('transactions')
  async transactions(
    @CurrentUser() userId: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('account') account?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const rows = await this.ledger.listTransactions(userId, {
      search,
      categorySlug: category,
      accountId: account,
      range: from && to ? { start: from, end: to } : undefined,
      limit: limit ? Number(limit) : 50,
    });
    return { count: rows.length, transactions: rows.map(present) };
  }

  @Get('transactions/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="finverse-transactions.csv"')
  async exportTransactions(
    @CurrentUser() userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ledger.listTransactions(userId, {
      range: from && to ? { start: from, end: to } : undefined,
      limit: 100_000,
    });
    return transactionsToCsv(rows);
  }

  /** The review queue: everything the categorizer refused to guess at. */
  @Get('transactions/needs-review')
  async needsReview(@CurrentUser() userId: string) {
    const rows = await this.ledger.listNeedsReview(userId);
    return { count: rows.length, transactions: rows.map(present) };
  }

  @Patch('transactions/:id/category')
  async recategorize(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { categorySlug?: string; createRule?: boolean },
  ) {
    const result = await this.ledger.recategorize(
      userId,
      id,
      body.categorySlug ?? '',
      body.createRule ?? false,
    );
    return {
      transaction: present(result.transaction),
      alsoUpdated: result.alsoUpdated,
      message:
        result.alsoUpdated > 0
          ? `Updated this and ${result.alsoUpdated} past transaction(s) from the same merchant.`
          : 'Updated.',
    };
  }
}
