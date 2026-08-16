import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { assertSharesReconcile, balancesFor, computeNetBalances, splitEqually, suggestSettlements } from '../../domain/split/split';
import type {
  SplitExpense,
  SplitGroup,
  SplitGroupMember,
  SplitSettlement,
} from '../../domain/split/types';
import { CLOCK, SPLIT_STORE, type ClockPort, type SplitStore } from '../../ports';
import { USER_STORE, type UserStore } from '../../ports/auth';

export interface CreateSplitGroupInput {
  name?: string;
  currency?: string;
}

export interface AddSplitMemberInput {
  email?: string;
}

export interface AddSplitExpenseInput {
  description?: string;
  category?: string;
  amount?: number;
  paidByUserId?: string;
  splitMethod?: 'equal' | 'shares';
  memberIds?: string[];
  shares?: { userId: string; amount: number }[];
}

export interface AddSplitSettlementInput {
  toUserId?: string;
  amount?: number;
  note?: string;
}

@Injectable()
export class SplitService {
  constructor(
    @Inject(SPLIT_STORE) private readonly splits: SplitStore,
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async listGroups(userId: string): Promise<SplitGroup[]> {
    return this.splits.listGroups(userId);
  }

  async createGroup(userId: string, input: CreateSplitGroupInput): Promise<SplitGroup> {
    const name = input.name?.trim() ?? '';
    if (name.length < 1 || name.length > 80) {
      throw new BadRequestException('Group name must be between 1 and 80 characters.');
    }
    const currency = (input.currency ?? 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be a three-letter ISO code.');
    }
    const group: SplitGroup = {
      id: randomUUID(),
      name,
      currency,
      createdBy: userId,
      createdAt: this.clock.today(),
      archivedAt: null,
    };
    await this.splits.createGroup(userId, group, {
      groupId: group.id,
      userId,
      role: 'admin',
      joinedAt: new Date().toISOString(),
    });
    return group;
  }

  async addMember(
    userId: string,
    groupId: string,
    input: AddSplitMemberInput,
  ): Promise<SplitGroupMember> {
    await this.assertMember(userId, groupId);
    const email = input.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required.');
    const invitee = await this.users.findByEmail(email);
    if (!invitee) {
      throw new NotFoundException('No FINVERSE account found for that email.');
    }
    const existing = await this.splits.listMembers(userId, groupId);
    if (existing.some((member) => member.userId === invitee.id)) {
      throw new BadRequestException('That user is already a member.');
    }
    return this.splits.addMember(userId, {
      groupId,
      userId: invitee.id,
      role: 'member',
      joinedAt: new Date().toISOString(),
    });
  }

  async addExpense(
    userId: string,
    groupId: string,
    input: AddSplitExpenseInput,
  ): Promise<SplitExpense> {
    const group = await this.assertMember(userId, groupId);
    const description = input.description?.trim() ?? '';
    if (description.length < 1 || description.length > 200) {
      throw new BadRequestException('Description must be between 1 and 200 characters.');
    }
    const amount = input.amount;
    if (!Number.isInteger(amount) || (amount ?? 0) <= 0) {
      throw new BadRequestException('amount must be a positive integer in minor units.');
    }

    const members = await this.splits.listMembers(userId, groupId);
    const memberIds = new Set(members.map((member) => member.userId));

    const paidByUserId = input.paidByUserId ?? userId;
    if (!memberIds.has(paidByUserId)) {
      throw new BadRequestException('paidByUserId must be a group member.');
    }

    const splitMethod = input.splitMethod ?? 'equal';
    let participants;
    if (splitMethod === 'shares') {
      const shares = input.shares ?? [];
      for (const share of shares) {
        if (!memberIds.has(share.userId)) {
          throw new BadRequestException('Every share must name a group member.');
        }
      }
      try {
        assertSharesReconcile(amount!, shares);
      } catch {
        throw new BadRequestException('Shares must be positive and sum exactly to the amount.');
      }
      participants = shares.map((share) => ({
        expenseId: '',
        userId: share.userId,
        amount: share.amount,
      }));
    } else {
      const ids = input.memberIds && input.memberIds.length > 0 ? input.memberIds : [...memberIds];
      for (const id of ids) {
        if (!memberIds.has(id)) throw new BadRequestException('Every member must belong to the group.');
      }
      participants = splitEqually(amount!, [...new Set(ids)]).map((share) => ({
        expenseId: '',
        userId: share.userId,
        amount: share.amount,
      }));
    }

    const date = this.clock.today();
    const expense: SplitExpense = {
      id: randomUUID(),
      groupId,
      description,
      category: (input.category ?? 'other').toLowerCase(),
      amount: amount!,
      currency: group.currency,
      paidByUserId,
      splitMethod,
      date,
      createdAt: new Date().toISOString(),
      participants: participants.map((participant) => ({ ...participant, expenseId: '' })),
    };
    const created = await this.splits.addExpense(userId, expense);
    return created;
  }

  async addSettlement(
    userId: string,
    groupId: string,
    input: AddSplitSettlementInput,
  ): Promise<SplitSettlement> {
    const group = await this.assertMember(userId, groupId);
    const toUserId = input.toUserId;
    if (!toUserId) throw new BadRequestException('toUserId is required.');
    if (toUserId === userId) throw new BadRequestException('You cannot settle up with yourself.');
    const members = await this.splits.listMembers(userId, groupId);
    if (!members.some((member) => member.userId === toUserId)) {
      throw new BadRequestException('toUserId must be a group member.');
    }
    const amount = input.amount;
    if (!Number.isInteger(amount) || (amount ?? 0) <= 0) {
      throw new BadRequestException('amount must be a positive integer in minor units.');
    }
    return this.splits.addSettlement(userId, {
      id: randomUUID(),
      groupId,
      fromUserId: userId,
      toUserId,
      amount: amount!,
      currency: group.currency,
      note: input.note?.trim() ?? '',
      createdAt: new Date().toISOString(),
    });
  }

  async archiveGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.assertMember(userId, groupId);
    if (group.createdBy !== userId) {
      throw new ForbiddenException('Only the group creator can archive a group.');
    }
    if (!(await this.splits.archiveGroup(userId, groupId))) {
      throw new NotFoundException('Group not found.');
    }
  }

  async groupDetail(userId: string, groupId: string) {
    const group = await this.assertMember(userId, groupId);
    const [members, expenses, settlements] = await Promise.all([
      this.splits.listMembers(userId, groupId),
      this.splits.listExpenses(userId, groupId),
      this.splits.listSettlements(userId, groupId),
    ]);
    const emails = await this.resolveEmails([
      ...members.map((member) => member.userId),
      ...expenses.map((expense) => expense.paidByUserId),
      ...expenses.flatMap((expense) => expense.participants.map((p) => p.userId)),
      ...settlements.flatMap((settlement) => [settlement.fromUserId, settlement.toUserId]),
    ]);
    const netBalances = computeNetBalances(expenses, settlements, group.currency);
    const balances = balancesFor(netBalances, members.map((member) => member.userId));
    const suggestions = suggestSettlements(netBalances);
    return { group, members, expenses, settlements, balances, suggestions, emails };
  }

  private async assertMember(userId: string, groupId: string): Promise<SplitGroup> {
    const group = await this.splits.getGroup(userId, groupId);
    if (!group) throw new NotFoundException('Group not found.');
    return group;
  }

  private async resolveEmails(ids: readonly string[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids)];
    const emails: Record<string, string> = {};
    for (const id of unique) {
      const user = await this.users.findById(id);
      if (user?.email) emails[id] = user.email;
    }
    return emails;
  }
}
