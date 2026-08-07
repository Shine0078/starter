import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import type { Transaction } from '../../domain/types';
import { CurrentUser } from '../current-user';
import { LedgerService } from './ledger.service';

/** Adds a display string alongside the integer. The client never does money
 *  math on the formatted value — it is for rendering only (ADR-0003). */
function present(txn: Transaction) {
  return {
    ...txn,
    amountFormatted: formatMoney(money(txn.amount, txn.currency)),
  };
}

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('sync')
  sync(@CurrentUser() userId: string) {
    return this.ledger.sync(userId);
  }

  @Get('accounts')
  async accounts(@CurrentUser() userId: string) {
    const accounts = await this.ledger.listAccounts(userId);
    return accounts.map((a) => ({
      ...a,
      balanceFormatted: formatMoney(money(a.balanceCurrent, a.currency)),
      utilization:
        a.type === 'credit_card' && a.creditLimit
          ? Math.max(0, -a.balanceCurrent) / a.creditLimit
          : null,
    }));
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
