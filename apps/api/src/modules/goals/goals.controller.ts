import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../auth/auth.guard';
import {
  GoalsService,
  type AddContributionInput,
  type CreateGoalInput,
} from './goals.service';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const goals = await this.goals.list(userId);
    return { count: goals.length, goals: goals.map(present) };
  }

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: CreateGoalInput) {
    return present(await this.goals.create(userId, body));
  }

  @Post(':id/contributions')
  async contribute(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: AddContributionInput,
  ) {
    return present(await this.goals.addContribution(userId, id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.goals.remove(userId, id);
  }
}

function present(progress: Awaited<ReturnType<GoalsService['create']>>) {
  const currency = progress.goal.currency;
  return {
    ...progress,
    savedFormatted: formatMoney(money(progress.savedAmount, currency)),
    targetFormatted: formatMoney(money(progress.goal.targetAmount, currency)),
    remainingFormatted: formatMoney(money(progress.remainingAmount, currency)),
    suggestedMonthlyFormatted:
      progress.suggestedMonthlyContribution === null
        ? null
        : formatMoney(money(progress.suggestedMonthlyContribution, currency)),
    percentComplete: Math.round(progress.percentComplete * 10) / 10,
  };
}
