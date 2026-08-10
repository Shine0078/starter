import { displayName } from '../categories';
import type { AnalyticsReport } from '../insights/analytics';
import type { DetectedSubscription } from '../insights/subscriptions';

export type AssistantIntent =
  | 'top_category'
  | 'category_spend'
  | 'merchant_spend'
  | 'subscriptions'
  | 'savings'
  | 'spending_change'
  | 'summary';

export interface AssistantFact {
  label: string;
  value: string;
}

export interface AssistantAnswer {
  intent: AssistantIntent;
  answer: string;
  facts: AssistantFact[];
  source: 'deterministic';
  caveat: string;
}

interface AssistantContext {
  report: AnalyticsReport;
  subscriptions: readonly DetectedSubscription[];
  formatMoney: (minorUnits: number) => string;
}

/**
 * Answers a small, useful set of finance questions without sending a user's
 * ledger anywhere. This is deliberately a pure function: a future LLM
 * adapter can sit beside it, but the core product must remain useful and
 * explainable when no model or zero-retention agreement is available.
 */
export function answerFinancialQuestion(
  question: string,
  context: AssistantContext,
): AssistantAnswer {
  const normalized = question.trim().toLocaleLowerCase();
  const { report, subscriptions, formatMoney } = context;

  if (matches(normalized, ['subscription', 'recurring charge', 'recurring payment'])) {
    const total = subscriptions.reduce((sum, item) => sum + item.annualCost, 0);
    const top = [...subscriptions].sort((a, b) => b.annualCost - a.annualCost)[0];
    return {
      intent: 'subscriptions',
      answer: subscriptions.length === 0
        ? 'I could not find a consistent subscription pattern in your transaction history.'
        : `I found ${subscriptions.length} recurring charge${subscriptions.length === 1 ? '' : 's'} costing about ${formatMoney(Math.round(total / 12))} per month.`,
      facts: top
        ? [
            { label: 'Largest recurring charge', value: `${top.merchant} - ${formatMoney(top.typicalAmount)} ${top.cadence}` },
            { label: 'Estimated yearly cost', value: formatMoney(total) },
          ]
        : [],
      source: 'deterministic',
      caveat: 'Recurring charges are inferred from transaction history; verify dates and amounts with the merchant.',
    };
  }

  if (matches(normalized, ['save', 'savings', 'net cash', 'left over'])) {
    return {
      intent: 'savings',
      answer: `You have ${formatMoney(report.savings)} in net savings for this period, a ${report.savingsRate.toFixed(1)}% savings rate.`,
      facts: [
        { label: 'Income', value: formatMoney(report.totalIncome) },
        { label: 'Net expenses', value: formatMoney(report.netExpenses) },
      ],
      source: 'deterministic',
      caveat: 'Savings uses posted, included transactions in the selected currency and period.',
    };
  }

  if (matches(normalized, ['higher', 'lower', 'usual', 'average', 'compared'])) {
    const delta = report.velocity.percentDelta;
    const direction = delta === null ? 'not enough history to compare spending with a prior period' :
      `${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? 'higher' : 'lower'} than the recent historical average`;
    return {
      intent: 'spending_change',
      answer: `Your spending is ${direction}.`,
      facts: [
        { label: 'This period', value: formatMoney(report.velocity.currentPeriodSpend) },
        { label: 'Projected period', value: formatMoney(report.velocity.projectedPeriodSpend) },
        ...(report.velocity.historicalAverageSpend === null
          ? []
          : [{ label: 'Historical average', value: formatMoney(report.velocity.historicalAverageSpend) }]),
      ],
      source: 'deterministic',
      caveat: 'The comparison uses the same currency and excludes pending or explicitly excluded transactions.',
    };
  }

  const merchant = findMentionedMerchant(normalized, report);
  if (merchant) {
    return {
      intent: 'merchant_spend',
      answer: `You spent ${formatMoney(merchant.total)} at ${merchant.key} across ${merchant.count} transaction${merchant.count === 1 ? '' : 's'} in this period.`,
      facts: [
        { label: 'Merchant', value: merchant.key },
        { label: 'Average transaction', value: formatMoney(Math.round(merchant.total / merchant.count)) },
      ],
      source: 'deterministic',
      caveat: 'Merchant names come from bank descriptors and your own corrections.',
    };
  }

  const category = findMentionedCategory(normalized, report);
  if (category) {
    return {
      intent: 'category_spend',
      answer: `You spent ${formatMoney(category.total)} on ${displayName(category.key)} across ${category.count} transaction${category.count === 1 ? '' : 's'} in this period.`,
      facts: [
        { label: 'Category', value: displayName(category.key) },
        { label: 'Average transaction', value: formatMoney(Math.round(category.total / category.count)) },
      ],
      source: 'deterministic',
      caveat: 'Categories are based on posted, included transactions and your saved corrections.',
    };
  }

  if (matches(normalized, ['where', 'most', 'largest', 'biggest', 'category', 'spend'])) {
    const top = report.spendingByCategory[0];
    return {
      intent: 'top_category',
      answer: top
        ? `Your largest spending category is ${displayName(top.key)} at ${formatMoney(top.total)}.`
        : 'There is no included spending in this period yet.',
      facts: report.spendingByCategory.slice(0, 3).map((item) => ({
        label: displayName(item.key),
        value: formatMoney(item.total),
      })),
      source: 'deterministic',
      caveat: 'Categories are assigned by the explainable categorizer and can be corrected from a transaction.',
    };
  }

  const topCategory = report.spendingByCategory[0];
  return {
    intent: 'summary',
    answer: topCategory
      ? `This period you spent ${formatMoney(report.netExpenses)} and saved ${formatMoney(report.savings)}. ${displayName(topCategory.key)} was your largest category.`
      : `This period you have ${formatMoney(report.netExpenses)} in net expenses and ${formatMoney(report.savings)} in savings.`,
    facts: [
      { label: 'Transactions', value: String(report.expenseCount) },
      { label: 'Average expense', value: formatMoney(report.averageExpense) },
      { label: 'Savings rate', value: `${report.savingsRate.toFixed(1)}%` },
    ],
    source: 'deterministic',
    caveat: 'Ask about a category, merchant, subscriptions, savings, or spending changes for a more focused answer.',
  };
}

function matches(question: string, terms: readonly string[]): boolean {
  return terms.some((term) => question.includes(term));
}

function findMentionedMerchant(
  question: string,
  report: AnalyticsReport,
): AnalyticsReport['spendingByMerchant'][number] | undefined {
  return [...report.spendingByMerchant]
    .sort((a, b) => b.key.length - a.key.length)
    .find((merchant) => merchant.key.trim().length >= 3 && question.includes(merchant.key.toLocaleLowerCase()));
}

function findMentionedCategory(
  question: string,
  report: AnalyticsReport,
): AnalyticsReport['spendingByCategory'][number] | undefined {
  return [...report.spendingByCategory]
    .sort((a, b) => displayName(b.key).length - displayName(a.key).length)
    .find((category) => {
      const name = displayName(category.key).toLocaleLowerCase();
      return name.length >= 3 && question.includes(name);
    });
}
