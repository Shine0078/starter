import { Inject, Injectable, Optional } from '@nestjs/common';

import { addDays, comparablePreviousRange, monthToDateRange } from '../../domain/dates';
import {
  cashFlowInsight,
  compareCategoryTotals,
  summarizePeriod,
  type Insight,
  type PeriodSummary,
} from '../../domain/insights/insights';
import {
  detectSubscriptions,
  staleSubscriptions,
  totalAnnualSubscriptionCost,
  type DetectedSubscription,
} from '../../domain/insights/subscriptions';
import { forecastCashFlow, type CashFlowForecast } from '../../domain/insights/cash-flow-forecast';
import { simulatePurchase, type PurchaseScenario } from '../../domain/insights/purchase-simulator';
import { computeAnalytics, type AnalyticsReport } from '../../domain/insights/analytics';
import { buildCreditCardPlans, type CreditCardPlan } from '../../domain/credit-cards/payment-plan';
import { computeHealthScore, type HealthScore } from '../../domain/health-score/score';
import {
  ACCOUNT_STORE,
  CLOCK,
  TRANSACTION_STORE,
  type AccountStore,
  type ClockPort,
  type TransactionStore,
} from '../../ports';
import { BudgetsService } from '../budgets/budgets.service';
import {
  FinanceEventBus,
  type FinanceEvent,
} from '../../infra/events/finance-event-bus';

export interface MonthlyReport {
  summary: PeriodSummary;
  previous: PeriodSummary;
  insights: Insight[];
}

export interface ProfessionalMonthlyReport {
  asOf: string;
  report: MonthlyReport;
  budgets: Awaited<ReturnType<BudgetsService['progress']>>;
  subscriptions: Awaited<ReturnType<InsightsService['subscriptions']>>;
  health: HealthScore;
  forecast: CashFlowForecast;
  creditCards: CreditCardPlan[];
}

@Injectable()
export class InsightsService {
  private static readonly analyticsCacheTtlMs = 30_000;
  private static readonly analyticsCacheMaxEntries = 256;
  private readonly analyticsCache = new Map<string, AnalyticsCacheEntry>();

  constructor(
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly budgets: BudgetsService,
    @Optional() private readonly events?: FinanceEventBus,
  ) {
    this.events?.subscribe((event) => this.invalidateForEvent(event));
  }

  async monthlyReport(userId: string, asOf?: string): Promise<MonthlyReport> {
    const today = asOf ?? this.clock.today();
    const transactions = await this.transactions.list(userId);

    // Month-to-date against the same elapsed window last month, so the
    // comparison isn't dominated by how far into the month we are.
    const summary = summarizePeriod(transactions, monthToDateRange(today), 'USD');
    const previous = summarizePeriod(transactions, comparablePreviousRange(today), 'USD');

    const insights = compareCategoryTotals(summary, previous, transactions);
    const cashFlow = cashFlowInsight(summary);
    if (cashFlow) insights.unshift(cashFlow);

    return { summary, previous, insights };
  }

  async subscriptions(
    userId: string,
    asOf?: string,
  ): Promise<{
    subscriptions: DetectedSubscription[];
    annualTotal: number;
    monthlyTotal: number;
    priceIncreases: DetectedSubscription[];
    possiblyCancelled: DetectedSubscription[];
  }> {
    const today = asOf ?? this.clock.today();
    const transactions = await this.transactions.list(userId);
    const detected = detectSubscriptions(transactions);
    const annualTotal = totalAnnualSubscriptionCost(detected);

    return {
      subscriptions: detected,
      annualTotal,
      monthlyTotal: Math.round(annualTotal / 12),
      priceIncreases: detected.filter((s) => s.priceIncrease !== null),
      possiblyCancelled: staleSubscriptions(detected, today),
    };
  }

  async analytics(
    userId: string,
    period: 'week' | 'month' | '3m' | '6m' | 'year' | 'lifetime' | 'custom' = 'month',
    asOf?: string,
    customRange?: { start: string; end: string },
    currency = 'USD',
  ): Promise<AnalyticsReport> {
    const today = asOf ?? this.clock.today();
    const key = analyticsCacheKey(userId, period, today, customRange, currency);
    const now = Date.now();
    const cached = this.analyticsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.report;
    this.analyticsCache.delete(key);

    const transactions = await this.transactions.list(userId);
    const range = customRange ?? (
      period === 'lifetime'
        ? lifetimeRange(transactions, today)
        : analyticsRange(period, today)
    );
    const report = computeAnalytics(transactions, range, currency, today);
    this.storeAnalyticsCache(
      key,
      report,
      now,
    );
    return report;
  }

  private storeAnalyticsCache(
    key: string,
    report: AnalyticsReport,
    now: number,
  ): void {
    if (this.analyticsCache.size >= InsightsService.analyticsCacheMaxEntries) {
      const oldest = this.analyticsCache.keys().next().value;
      if (oldest) this.analyticsCache.delete(oldest);
    }
    this.analyticsCache.set(key, {
      report,
      expiresAt: now + InsightsService.analyticsCacheTtlMs,
    });
  }

  private invalidateForEvent(event: FinanceEvent): void {
    if (![
      'TransactionImported',
      'TransactionUpdated',
      'TransactionCategorized',
      'BankSyncCompleted',
      'AccountConnected',
      'AccountUpdated',
      'AccountDisconnected',
    ].includes(event.type)) return;

    const prefix = `${event.userId}:`;
    for (const key of this.analyticsCache.keys()) {
      if (key.startsWith(prefix)) this.analyticsCache.delete(key);
    }
  }

  async healthScore(userId: string, asOf?: string): Promise<HealthScore> {
    const today = asOf ?? this.clock.today();
    const [transactions, accounts, adherence] = await Promise.all([
      this.transactions.list(userId),
      this.accounts.list(userId),
      this.budgets.adherenceRatio(userId, today),
    ]);

    // Trailing 30 days, not month-to-date. The emergency-fund component divides
    // savings by "monthly expenses"; feeding it a 7-day figure on the 7th would
    // report 30 months of runway where there are 7.
    const summary = summarizePeriod(transactions, { start: addDays(today, -29), end: today }, 'USD');

    return computeHealthScore({
      summary,
      accounts,
      transactions,
      budgetAdherenceRatio: adherence,
    });
  }

  /**
   * A conservative 7/30/90-day outlook based only on recurring income and
   * recurring charges.  It deliberately does not invent discretionary spend.
   */
  async cashFlowForecast(
    userId: string,
    days: number,
    asOf?: string,
    currency = 'USD',
  ): Promise<CashFlowForecast> {
    const today = asOf ?? this.clock.today();
    const [transactions, accounts] = await Promise.all([
      this.transactions.list(userId),
      this.accounts.list(userId),
    ]);
    return forecastCashFlow(accounts, transactions, today, days, currency);
  }

  async creditCardPlans(userId: string, asOf?: string): Promise<CreditCardPlan[]> {
    return buildCreditCardPlans(await this.accounts.list(userId), asOf ?? this.clock.today());
  }

  async purchaseScenario(
    userId: string,
    days: number,
    amount: number,
    purchaseDate: string,
    asOf?: string,
    currency = 'USD',
  ): Promise<PurchaseScenario> {
    const today = asOf ?? this.clock.today();
    const [transactions, accounts] = await Promise.all([
      this.transactions.list(userId),
      this.accounts.list(userId),
    ]);
    return simulatePurchase(accounts, transactions, today, days, amount, purchaseDate, currency);
  }

  async professionalMonthlyReport(
    userId: string,
    asOf?: string,
  ): Promise<ProfessionalMonthlyReport> {
    const today = asOf ?? this.clock.today();
    const [report, budgets, subscriptions, health, forecast, creditCards] = await Promise.all([
      this.monthlyReport(userId, today),
      this.budgets.progress(userId, today),
      this.subscriptions(userId, today),
      this.healthScore(userId, today),
      this.cashFlowForecast(userId, 30, today),
      this.creditCardPlans(userId, today),
    ]);

    return {
      asOf: today,
      report,
      budgets,
      subscriptions,
      health,
      forecast,
      creditCards,
    };
  }
}

function analyticsRange(
  period: 'week' | 'month' | '3m' | '6m' | 'year' | 'custom',
  today: string,
): { start: string; end: string } {
  switch (period) {
    case 'week':
      return { start: addDays(today, -6), end: today };
    case '3m':
      return { start: addDays(today, -89), end: today };
    case '6m':
      return { start: addDays(today, -179), end: today };
    case 'year':
      return { start: addDays(today, -364), end: today };
    case 'month':
      return monthToDateRange(today);
    case 'custom':
      throw new Error('A custom analytics range must be supplied.');
  }
}

function lifetimeRange(
  transactions: readonly { postedAt: string }[],
  today: string,
): { start: string; end: string } {
  const firstDate = transactions
    .map((transaction) => transaction.postedAt)
    .filter((date) => date <= today)
    .sort()[0];
  return { start: firstDate ?? today, end: today };
}

function analyticsCacheKey(
  userId: string,
  period: string,
  today: string,
  customRange: { start: string; end: string } | undefined,
  currency: string,
): string {
  return [
    userId,
    period,
    today,
    customRange?.start ?? '',
    customRange?.end ?? '',
    currency,
  ].join(':');
}

interface AnalyticsCacheEntry {
  report: AnalyticsReport;
  expiresAt: number;
}
