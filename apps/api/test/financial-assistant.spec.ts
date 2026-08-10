import { describe, expect, it } from 'vitest';

import {
  answerFinancialQuestion,
  type AssistantFact,
} from '../src/domain/assistant/financial-assistant';
import type { AnalyticsReport } from '../src/domain/insights/analytics';
import type { DetectedSubscription } from '../src/domain/insights/subscriptions';

function report(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    period: { start: '2026-08-01', end: '2026-08-31' },
    currency: 'USD',
    grossExpenses: 85_000,
    refunds: 0,
    refundMatches: [],
    netExpenses: 85_000,
    expenseCount: 4,
    averageExpense: 21_250,
    medianExpense: 20_000,
    largestExpense: null,
    spendingByCategory: [{ key: 'restaurants', total: 60_000, count: 3 }],
    spendingByMerchant: [{ key: 'Starbucks', total: 12_500, count: 2 }],
    spendingByAccount: [],
    recurringSpending: 12_500,
    discretionarySpending: 60_000,
    essentialSpending: 25_000,
    totalIncome: 200_000,
    recurringIncome: 200_000,
    irregularIncome: 0,
    incomeBySource: [],
    savings: 115_000,
    savingsRate: 57.5,
    averageMonthlySavings: 115_000,
    velocity: {
      currentPeriodSpend: 85_000,
      projectedPeriodSpend: 90_000,
      historicalAverageSpend: 80_000,
      percentDelta: 12.5,
      enoughHistory: true,
    },
    timeline: [],
    ...overrides,
  };
}

function subscription(overrides: Partial<DetectedSubscription> = {}): DetectedSubscription {
  return {
    merchant: 'Stream Co',
    normalizedDescriptor: 'stream co',
    categorySlug: 'subscriptions',
    cadence: 'monthly',
    observedIntervalDays: 30,
    typicalAmount: 1_500,
    currency: 'USD',
    occurrences: 4,
    firstSeen: '2026-01-01',
    lastSeen: '2026-04-01',
    nextExpected: '2026-05-01',
    annualCost: 18_000,
    priceIncrease: null,
    transactionIds: [],
    confidence: 0.95,
    ...overrides,
  };
}

function answer(question: string, current = report(), recurring: readonly DetectedSubscription[] = []) {
  return answerFinancialQuestion(question, {
    report: current,
    subscriptions: recurring,
    formatMoney: (minorUnits) => `$${(minorUnits / 100).toFixed(2)}`,
  });
}

describe('answerFinancialQuestion', () => {
  it('answers top-category questions with ranked evidence', () => {
    const result = answer('Where did I spend the most?');
    expect(result.intent).toBe('top_category');
    expect(result.answer).toContain('Restaurants');
    expect(result.facts).toEqual([{ label: 'Restaurants', value: '$600.00' }]);
  });

  it('answers merchant questions without sending raw transactions to a model', () => {
    const result = answer('How much did I spend at starbucks?');
    expect(result.intent).toBe('merchant_spend');
    expect(result.answer).toContain('$125.00');
    expect(result.facts as AssistantFact[]).toContainEqual({ label: 'Merchant', value: 'Starbucks' });
  });

  it('answers a named category with the category aggregate', () => {
    const result = answer('How much did I spend on restaurants?');
    expect(result.intent).toBe('category_spend');
    expect(result.answer).toContain('$600.00');
  });

  it('answers recurring-cost questions from detected subscriptions', () => {
    const result = answer('Which subscriptions am I paying for?', report(), [subscription()]);
    expect(result.intent).toBe('subscriptions');
    expect(result.answer).toContain('$15.00 per month');
    expect(result.facts).toContainEqual({ label: 'Estimated yearly cost', value: '$180.00' });
  });

  it('falls back to a concise, explainable summary', () => {
    const result = answer('Tell me something useful');
    expect(result.intent).toBe('summary');
    expect(result.answer).toContain('$850.00');
    expect(result.caveat).toContain('category');
  });
});
