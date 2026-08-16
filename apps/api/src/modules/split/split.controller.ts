import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import type {
  SplitExpense,
  SplitGroup,
  SplitGroupMember,
  SplitSettlement,
} from '../../domain/split/types';
import { CurrentUser } from '../auth/auth.guard';
import {
  SplitService,
  type AddSplitExpenseInput,
  type AddSplitMemberInput,
  type AddSplitSettlementInput,
  type CreateSplitGroupInput,
} from './split.service';

@Controller('split')
export class SplitController {
  constructor(private readonly split: SplitService) {}

  @Get('groups')
  async listGroups(@CurrentUser() userId: string) {
    const groups = await this.split.listGroups(userId);
    return { count: groups.length, groups: groups.map(presentGroup) };
  }

  @Post('groups')
  async createGroup(@CurrentUser() userId: string, @Body() body: CreateSplitGroupInput) {
    return presentGroup(await this.split.createGroup(userId, body));
  }

  @Get('groups/:id')
  async detail(@CurrentUser() userId: string, @Param('id') groupId: string) {
    const { group, members, expenses, settlements, balances, suggestions, emails } =
      await this.split.groupDetail(userId, groupId);
    const currency = group.currency;
    return {
      group: presentGroup(group),
      members: members.map((member) => presentMember(member, emails[member.userId])),
      expenses: expenses.map((expense) => presentExpense(expense, emails)),
      settlements: settlements.map((settlement) => presentSettlement(settlement, emails)),
      balances: balances.map((balance) => ({
        userId: balance.userId,
        email: emails[balance.userId] ?? null,
        netAmount: balance.netAmount,
        netFormatted: formatMoney(money(balance.netAmount, currency)),
      })),
      suggestions: suggestions.map((suggestion) => ({
        fromUserId: suggestion.fromUserId,
        toUserId: suggestion.toUserId,
        amount: suggestion.amount,
        amountFormatted: formatMoney(money(suggestion.amount, currency)),
      })),
    };
  }

  @Post('groups/:id/members')
  async addMember(
    @CurrentUser() userId: string,
    @Param('id') groupId: string,
    @Body() body: AddSplitMemberInput,
  ) {
    const member = await this.split.addMember(userId, groupId, body);
    return presentMember(member, null);
  }

  @Post('groups/:id/expenses')
  async addExpense(
    @CurrentUser() userId: string,
    @Param('id') groupId: string,
    @Body() body: AddSplitExpenseInput,
  ) {
    const expense = await this.split.addExpense(userId, groupId, body);
    return presentExpense(expense, {});
  }

  @Post('groups/:id/settlements')
  async addSettlement(
    @CurrentUser() userId: string,
    @Param('id') groupId: string,
    @Body() body: AddSplitSettlementInput,
  ) {
    return presentSettlement(await this.split.addSettlement(userId, groupId, body), {});
  }

  @Post('groups/:id/archive')
  @HttpCode(204)
  archive(@CurrentUser() userId: string, @Param('id') groupId: string) {
    return this.split.archiveGroup(userId, groupId);
  }
}

function presentGroup(group: SplitGroup) {
  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    createdAt: group.createdAt,
    archivedAt: group.archivedAt,
  };
}

function presentMember(member: SplitGroupMember, email: string | null | undefined) {
  return {
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    email: email ?? null,
  };
}

function presentExpense(expense: SplitExpense, emails: Record<string, string>) {
  const currency = expense.currency;
  return {
    id: expense.id,
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    amountFormatted: formatMoney(money(expense.amount, currency)),
    paidByUserId: expense.paidByUserId,
    paidByEmail: emails[expense.paidByUserId] ?? null,
    splitMethod: expense.splitMethod,
    date: expense.date,
    participants: expense.participants.map((participant) => ({
      userId: participant.userId,
      email: emails[participant.userId] ?? null,
      amount: participant.amount,
      amountFormatted: formatMoney(money(participant.amount, currency)),
    })),
  };
}

function presentSettlement(settlement: SplitSettlement, emails: Record<string, string>) {
  const currency = settlement.currency;
  return {
    id: settlement.id,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    fromEmail: emails[settlement.fromUserId] ?? null,
    toEmail: emails[settlement.toUserId] ?? null,
    amount: settlement.amount,
    amountFormatted: formatMoney(money(settlement.amount, currency)),
    note: settlement.note,
    createdAt: settlement.createdAt,
  };
}
