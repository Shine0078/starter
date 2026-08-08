import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { assertIsoDate } from '../../domain/dates';
import { computeGoalProgress, type GoalProgress } from '../../domain/goals/progress';
import type { GoalContribution, SavingsGoal } from '../../domain/types';
import { CLOCK, GOAL_STORE, type ClockPort, type GoalStore } from '../../ports';

export interface CreateGoalInput {
  name?: string;
  targetAmount?: number;
  currency?: string;
  targetDate?: string | null;
  initialAmount?: number;
}

export interface AddContributionInput {
  amount?: number;
  contributedAt?: string;
}

@Injectable()
export class GoalsService {
  constructor(
    @Inject(GOAL_STORE) private readonly goals: GoalStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async list(userId: string): Promise<GoalProgress[]> {
    const goals = await this.goals.list(userId);
    return Promise.all(
      goals.map(async (goal) =>
        computeGoalProgress(
          goal,
          await this.goals.listContributions(userId, goal.id),
          this.clock.today(),
        ),
      ),
    );
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalProgress> {
    const name = input.name?.trim() ?? '';
    if (name.length < 1 || name.length > 80) {
      throw new BadRequestException('Goal name must be between 1 and 80 characters.');
    }
    if (!Number.isInteger(input.targetAmount) || (input.targetAmount ?? 0) <= 0) {
      throw new BadRequestException('targetAmount must be a positive integer in minor units.');
    }
    const currency = (input.currency ?? 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('currency must be a three-letter ISO code.');
    }
    const today = this.clock.today();
    const targetDate = input.targetDate ?? null;
    if (targetDate !== null) {
      try {
        assertIsoDate(targetDate);
      } catch {
        throw new BadRequestException('targetDate must use YYYY-MM-DD.');
      }
      if (targetDate <= today) throw new BadRequestException('targetDate must be in the future.');
    }
    const initialAmount = input.initialAmount ?? 0;
    if (!Number.isInteger(initialAmount) || initialAmount < 0) {
      throw new BadRequestException('initialAmount must be a non-negative integer in minor units.');
    }

    const goal: SavingsGoal = {
      id: randomUUID(),
      name,
      targetAmount: input.targetAmount!,
      currency,
      targetDate,
      createdAt: today,
    };
    await this.goals.create(userId, goal);
    const contributions: GoalContribution[] = [];
    if (initialAmount > 0) {
      contributions.push(
        await this.goals.addContribution(userId, {
          id: randomUUID(),
          goalId: goal.id,
          amount: initialAmount,
          contributedAt: today,
        }),
      );
    }
    return computeGoalProgress(goal, contributions, today);
  }

  async addContribution(
    userId: string,
    goalId: string,
    input: AddContributionInput,
  ): Promise<GoalProgress> {
    const goal = await this.goals.get(userId, goalId);
    if (!goal) throw new NotFoundException('Goal not found.');
    if (!Number.isInteger(input.amount) || (input.amount ?? 0) <= 0) {
      throw new BadRequestException('amount must be a positive integer in minor units.');
    }
    const contributedAt = input.contributedAt ?? this.clock.today();
    try {
      assertIsoDate(contributedAt);
    } catch {
      throw new BadRequestException('contributedAt must use YYYY-MM-DD.');
    }
    if (contributedAt > this.clock.today()) {
      throw new BadRequestException('contributedAt cannot be in the future.');
    }

    await this.goals.addContribution(userId, {
      id: randomUUID(),
      goalId,
      amount: input.amount!,
      contributedAt,
    });
    return computeGoalProgress(
      goal,
      await this.goals.listContributions(userId, goalId),
      this.clock.today(),
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.goals.remove(userId, id))) throw new NotFoundException('Goal not found.');
  }
}
