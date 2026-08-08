import { describe, expect, it } from 'vitest';

import { computeGoalProgress } from '../src/domain/goals/progress';
import type { SavingsGoal } from '../src/domain/types';

const goal: SavingsGoal = {
  id: 'goal-1',
  name: 'Emergency fund',
  targetAmount: 120_000,
  currency: 'USD',
  targetDate: '2027-08-01',
  createdAt: '2026-08-01',
};

describe('goal progress', () => {
  it('sums contributions and suggests the monthly amount needed by the target', () => {
    const progress = computeGoalProgress(
      goal,
      [
        { id: 'c1', goalId: goal.id, amount: 10_000, contributedAt: '2026-08-01' },
        { id: 'c2', goalId: goal.id, amount: 20_000, contributedAt: '2026-08-05' },
      ],
      '2026-08-08',
    );

    expect(progress.savedAmount).toBe(30_000);
    expect(progress.remainingAmount).toBe(90_000);
    expect(progress.percentComplete).toBe(25);
    expect(progress.suggestedMonthlyContribution).toBe(7_500);
  });

  it('caps progress and marks a completed goal today', () => {
    const progress = computeGoalProgress(
      goal,
      [{ id: 'c1', goalId: goal.id, amount: 150_000, contributedAt: '2026-08-01' }],
      '2026-08-08',
    );
    expect(progress.remainingAmount).toBe(0);
    expect(progress.percentComplete).toBe(100);
    expect(progress.projectedCompletionDate).toBe('2026-08-08');
  });

  it('does not invent a projection without contribution evidence', () => {
    const progress = computeGoalProgress({ ...goal, targetDate: null }, [], '2026-08-08');
    expect(progress.suggestedMonthlyContribution).toBeNull();
    expect(progress.projectedCompletionDate).toBeNull();
  });
});
