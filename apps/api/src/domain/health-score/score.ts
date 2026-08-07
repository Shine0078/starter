/**
 * Financial health score, 0–1000.
 *
 * A single number is a blunt instrument, so two rules govern this file:
 *
 *   1. Every component is independently reported, with its own contribution.
 *      A score that drops without an explanation is worse than no score.
 *   2. Every component ships with a concrete action. "Your score is 640" is
 *      not useful. "Pay your card down by $420 to get under 30% utilization"
 *      is what the mission actually asks for.
 *
 * The weights are a defensible starting point, not received wisdom. They should
 * be revisited once there is behavioural data showing which components actually
 * predict outcomes.
 */

import { isSpendingCategory } from '../categories';
import type { Account, Transaction } from '../types';
import type { PeriodSummary } from '../insights/insights';

export type ComponentKey =
  | 'savings_rate'
  | 'credit_utilization'
  | 'budget_adherence'
  | 'emergency_fund'
  | 'payment_history'
  | 'cash_flow';

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  /** Points earned, 0..maxPoints. */
  points: number;
  maxPoints: number;
  /** 0–1, before weighting. */
  ratio: number;
  /** What the user can do about it. Null when the component is already maxed. */
  action: string | null;
  detail: string;
}

export interface HealthScore {
  /** 0–1000. */
  score: number;
  band: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
  components: ScoreComponent[];
  /** Highest-leverage actions first — the ones with the most points left. */
  topActions: string[];
}

const WEIGHTS: Readonly<Record<ComponentKey, number>> = {
  savings_rate: 250,
  credit_utilization: 200,
  budget_adherence: 150,
  emergency_fund: 150,
  cash_flow: 150,
  payment_history: 100,
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function bandFor(score: number): HealthScore['band'] {
  if (score >= 850) return 'excellent';
  if (score >= 700) return 'good';
  if (score >= 550) return 'fair';
  if (score >= 400) return 'poor';
  return 'critical';
}

export interface HealthScoreInput {
  summary: PeriodSummary;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  /** Fraction of budgets currently within their limit, 0–1. Null when the user
   *  has no budgets — we award neutral credit rather than punishing them for
   *  not having set any up yet. */
  budgetAdherenceRatio: number | null;
}

export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const { summary, accounts, transactions, budgetAdherenceRatio } = input;
  const components: ScoreComponent[] = [];

  // ---- Savings rate. 20% saved is the common target; treat that as full marks.
  const savingsRatio = clamp01(summary.savingsRate / 20);
  components.push({
    key: 'savings_rate',
    label: 'Savings rate',
    ratio: savingsRatio,
    maxPoints: WEIGHTS.savings_rate,
    points: Math.round(savingsRatio * WEIGHTS.savings_rate),
    detail: `You're saving ${summary.savingsRate.toFixed(1)}% of income.`,
    action:
      savingsRatio >= 1
        ? null
        : `Increase savings to 20% of income to max this out (currently ${summary.savingsRate.toFixed(0)}%).`,
  });

  // ---- Credit utilization. Under 30% is the threshold lenders care about;
  //      0% utilization is not penalised here, though scoring bureaus differ.
  const cards = accounts.filter((a) => a.type === 'credit_card' && (a.creditLimit ?? 0) > 0);
  const totalLimit = cards.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const totalOwed = cards.reduce((s, a) => s + Math.max(0, -a.balanceCurrent), 0);
  const utilization = totalLimit > 0 ? totalOwed / totalLimit : 0;
  // Full marks at or below 30%, zero at 90% or above, linear between.
  const utilizationRatio = totalLimit === 0 ? 1 : clamp01((0.9 - utilization) / 0.6);
  const payDownTarget = Math.max(0, totalOwed - totalLimit * 0.3);
  components.push({
    key: 'credit_utilization',
    label: 'Credit utilization',
    ratio: utilizationRatio,
    maxPoints: WEIGHTS.credit_utilization,
    points: Math.round(utilizationRatio * WEIGHTS.credit_utilization),
    detail:
      totalLimit === 0
        ? 'No credit cards connected.'
        : `Using ${(utilization * 100).toFixed(0)}% of your available credit.`,
    action:
      payDownTarget > 0
        ? `Pay down ${(payDownTarget / 100).toFixed(0)} ${summary.currency} to get under 30% utilization.`
        : null,
  });

  // ---- Budget adherence. Neutral 0.7 when there are no budgets: absence of
  //      budgets is not evidence of bad habits, but it isn't evidence of good
  //      ones either.
  const adherence = budgetAdherenceRatio ?? 0.7;
  components.push({
    key: 'budget_adherence',
    label: 'Budget adherence',
    ratio: clamp01(adherence),
    maxPoints: WEIGHTS.budget_adherence,
    points: Math.round(clamp01(adherence) * WEIGHTS.budget_adherence),
    detail:
      budgetAdherenceRatio === null
        ? 'No budgets set yet.'
        : `${Math.round(adherence * 100)}% of your budgets are on track.`,
    action:
      budgetAdherenceRatio === null
        ? 'Set a budget for your largest spending category.'
        : adherence >= 1
          ? null
          : 'Bring your over-budget categories back under their limits.',
  });

  // ---- Emergency fund. Target three months of expenses in liquid accounts.
  const liquid = accounts
    .filter((a) => a.type === 'savings' || a.type === 'checking' || a.type === 'cash')
    .reduce((s, a) => s + Math.max(0, a.balanceCurrent), 0);
  const monthlyExpenses = summary.expenses;
  const monthsCovered = monthlyExpenses > 0 ? liquid / monthlyExpenses : 0;
  const emergencyRatio = clamp01(monthsCovered / 3);
  components.push({
    key: 'emergency_fund',
    label: 'Emergency fund',
    ratio: emergencyRatio,
    maxPoints: WEIGHTS.emergency_fund,
    points: Math.round(emergencyRatio * WEIGHTS.emergency_fund),
    detail:
      monthlyExpenses > 0
        ? `You have ${monthsCovered.toFixed(1)} months of expenses saved.`
        : 'Not enough spending history to estimate.',
    action:
      emergencyRatio >= 1
        ? null
        : `Build toward 3 months of expenses (${((monthlyExpenses * 3 - liquid) / 100).toFixed(0)} ${summary.currency} to go).`,
  });

  // ---- Cash flow. Positive is full marks; the penalty scales with how far
  //      underwater the period was relative to income.
  const cashFlowRatio =
    summary.income > 0
      ? clamp01(1 + Math.min(0, summary.netCashFlow) / summary.income)
      : summary.netCashFlow >= 0
        ? 1
        : 0;
  components.push({
    key: 'cash_flow',
    label: 'Cash flow',
    ratio: cashFlowRatio,
    maxPoints: WEIGHTS.cash_flow,
    points: Math.round(cashFlowRatio * WEIGHTS.cash_flow),
    detail:
      summary.netCashFlow >= 0
        ? 'You earned more than you spent this period.'
        : 'You spent more than you earned this period.',
    action: summary.netCashFlow >= 0 ? null : 'Reduce spending or increase income to get cash flow positive.',
  });

  // ---- Payment history. Proxy until we track due dates against payments:
  //      late fees and interest charges appearing in the fees category.
  const feeTransactions = transactions.filter(
    (t) => t.categorySlug === 'fees' && isSpendingCategory(t.categorySlug) && t.amount < 0,
  );
  const paymentRatio = feeTransactions.length === 0 ? 1 : clamp01(1 - feeTransactions.length * 0.25);
  components.push({
    key: 'payment_history',
    label: 'Payment history',
    ratio: paymentRatio,
    maxPoints: WEIGHTS.payment_history,
    points: Math.round(paymentRatio * WEIGHTS.payment_history),
    detail:
      feeTransactions.length === 0
        ? 'No late fees or interest charges found.'
        : `${feeTransactions.length} fee or interest charge(s) found.`,
    action:
      feeTransactions.length === 0
        ? null
        : 'Set up autopay for minimum payments to avoid late fees.',
  });

  const score = components.reduce((sum, c) => sum + c.points, 0);

  const topActions = components
    .filter((c) => c.action !== null)
    .sort((a, b) => b.maxPoints - b.points - (a.maxPoints - a.points))
    .slice(0, 3)
    .map((c) => c.action!);

  return { score, band: bandFor(score), components, topActions };
}
