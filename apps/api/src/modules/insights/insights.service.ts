import { Inject, Injectable } from '@nestjs/common';

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
  constructor(
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly budgets: BudgetsService,
  ) {}

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
  async cashFlowForecast(userId: string, days: number, asOf?: string): Promise<CashFlowForecast> {
    const today = asOf ?? this.clock.today();
    const [transactions, accounts] = await Promise.all([
      this.transactions.list(userId),
      this.accounts.list(userId),
    ]);
    return forecastCashFlow(accounts, transactions, today, days);
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
  ): Promise<PurchaseScenario> {
    const today = asOf ?? this.clock.today();
    const [transactions, accounts] = await Promise.all([
      this.transactions.list(userId),
      this.accounts.list(userId),
    ]);
    return simulatePurchase(accounts, transactions, today, days, amount, purchaseDate);
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
