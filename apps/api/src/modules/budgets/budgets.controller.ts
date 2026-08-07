import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { displayName } from '../../domain/categories';
import { CurrentUser } from '../current-user';
import { BudgetsService, type CreateBudgetInput } from './budgets.service';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.budgets.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateBudgetInput) {
    return this.budgets.create(userId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.budgets.remove(userId, id);
  }

  @Get('progress')
  async progress(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    const rows = await this.budgets.progress(userId, asOf);
    return {
      count: rows.length,
      budgets: rows.map((r) => ({
        ...r,
        categoryName: displayName(r.categorySlug),
        limitFormatted: formatMoney(money(r.limitAmount, r.currency)),
        spentFormatted: formatMoney(money(r.spentAmount, r.currency)),
        remainingFormatted: formatMoney(money(r.remainingAmount, r.currency)),
        percentUsed: Math.round(r.percentUsed * 10) / 10,
      })),
      alerts: rows.flatMap((r) => r.alerts),
    };
  }
}
