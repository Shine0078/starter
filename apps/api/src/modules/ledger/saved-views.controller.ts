import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import type { Transaction } from '../../domain/types';
import { CurrentUser } from '../auth/auth.guard';
import { SavedViewsService, type CreateSavedViewInput } from './saved-views.service';

function present(txn: Transaction) {
  return { ...txn, amountFormatted: formatMoney(money(txn.amount, txn.currency)) };
}

@Controller('transaction-views')
export class SavedViewsController {
  constructor(private readonly views: SavedViewsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const views = await this.views.list(userId);
    return { count: views.length, views };
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateSavedViewInput) {
    return this.views.create(userId, body);
  }

  /** Runs the view through the same query path the live transaction list uses. */
  @Get(':id/transactions')
  async apply(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    const result = await this.views.apply(
      userId,
      id,
      Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 50,
    );

    return {
      view: result.view,
      count: result.transactions.length,
      transactions: result.transactions.map(present),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.views.remove(userId, id);
  }
}
