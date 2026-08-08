import { addMonths, toUtcDate } from '../dates';
import type { GoalContribution, IsoDate, SavingsGoal } from '../types';

export interface GoalProgress {
  goal: SavingsGoal;
  savedAmount: number;
  remainingAmount: number;
  percentComplete: number;
  suggestedMonthlyContribution: number | null;
  projectedCompletionDate: IsoDate | null;
}

function monthsBetween(start: IsoDate, end: IsoDate): number {
  const a = toUtcDate(start);
  const b = toUtcDate(end);
  const whole = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  return Math.max(1, whole + (b.getUTCDate() > a.getUTCDate() ? 1 : 0));
}

export function computeGoalProgress(
  goal: SavingsGoal,
  contributions: readonly GoalContribution[],
  today: IsoDate,
): GoalProgress {
  const savedAmount = contributions.reduce((sum, row) => sum + row.amount, 0);
  const remainingAmount = Math.max(0, goal.targetAmount - savedAmount);
  const percentComplete = Math.min(100, (savedAmount / goal.targetAmount) * 100);
  const suggestedMonthlyContribution = goal.targetDate
    ? Math.ceil(remainingAmount / monthsBetween(today, goal.targetDate))
    : null;

  let projectedCompletionDate: IsoDate | null = null;
  if (remainingAmount === 0) {
    projectedCompletionDate = today;
  } else if (contributions.length > 0 && savedAmount > 0) {
    const first = contributions.reduce(
      (earliest, row) => (row.contributedAt < earliest ? row.contributedAt : earliest),
      contributions[0]!.contributedAt,
    );
    const monthlyPace = savedAmount / monthsBetween(first, today);
    projectedCompletionDate = addMonths(today, Math.ceil(remainingAmount / monthlyPace));
  }

  return {
    goal,
    savedAmount,
    remainingAmount,
    percentComplete,
    suggestedMonthlyContribution,
    projectedCompletionDate,
  };
}
