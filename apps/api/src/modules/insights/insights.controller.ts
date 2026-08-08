import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../auth/auth.guard';
import { InsightsService } from './insights.service';

@Controller()
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  async monthly(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    const report = await this.insights.monthlyReport(userId, asOf);
    const { summary } = report;

    return {
      period: summary.period,
      headline: {
        income: formatMoney(money(summary.income, summary.currency)),
        expenses: formatMoney(money(summary.expenses, summary.currency)),
        netCashFlow: formatMoney(money(summary.netCashFlow, summary.currency)),
        savingsRate: `${summary.savingsRate.toFixed(1)}%`,
        averageDailySpend: formatMoney(money(summary.averageDailySpend, summary.currency)),
        transactionCount: summary.transactionCount,
      },
      topCategories: summary.topCategories.slice(0, 8).map((c) => ({
        ...c,
        totalFormatted: formatMoney(money(c.total, summary.currency)),
      })),
      topMerchant: summary.topMerchant && {
        ...summary.topMerchant,
        totalFormatted: formatMoney(money(summary.topMerchant.total, summary.currency)),
      },
      mostExpensiveDay: summary.mostExpensiveDay && {
        ...summary.mostExpensiveDay,
        totalFormatted: formatMoney(money(summary.mostExpensiveDay.total, summary.currency)),
      },
      insights: report.insights,
      raw: { summary, previous: report.previous },
    };
  }

  @Get('subscriptions')
  async subscriptions(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    const result = await this.insights.subscriptions(userId, asOf);
    return {
      count: result.subscriptions.length,
      annualTotalFormatted: formatMoney(money(result.annualTotal, 'USD')),
      monthlyTotalFormatted: formatMoney(money(result.monthlyTotal, 'USD')),
      subscriptions: result.subscriptions.map((s) => ({
        ...s,
        typicalAmountFormatted: formatMoney(money(s.typicalAmount, s.currency)),
        annualCostFormatted: formatMoney(money(s.annualCost, s.currency)),
        confidence: Math.round(s.confidence * 100) / 100,
      })),
      priceIncreases: result.priceIncreases.map((s) => ({
        merchant: s.merchant,
        from: formatMoney(money(s.priceIncrease!.from, s.currency)),
        to: formatMoney(money(s.priceIncrease!.to, s.currency)),
        percent: Math.round(s.priceIncrease!.percent),
        annualImpact: formatMoney(
          money(
            Math.round((s.priceIncrease!.to - s.priceIncrease!.from) * (s.annualCost / s.typicalAmount)),
            s.currency,
          ),
        ),
      })),
      possiblyCancelled: result.possiblyCancelled.map((s) => s.merchant),
    };
  }

  @Get('health-score')
  async healthScore(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    return this.insights.healthScore(userId, asOf);
  }

  @Get('cash-flow-forecast')
  async cashFlowForecast(
    @CurrentUser() userId: string,
    @Query('days') days = '30',
    @Query('asOf') asOf?: string,
  ) {
    const parsedDays = Number(days);
    if (![7, 30, 90].includes(parsedDays)) {
      // These are deliberately curated product horizons, not an arbitrary
      // graph length a client can accidentally turn into a false forecast.
      throw new BadRequestException('days must be one of 7, 30, or 90');
    }

    const forecast = await this.insights.cashFlowForecast(userId, parsedDays, asOf);
    return {
      ...forecast,
      startingBalanceFormatted: formatMoney(money(forecast.startingBalance, forecast.currency)),
      endingBalanceFormatted: formatMoney(
        money(forecast.points[forecast.points.length - 1]?.balance ?? forecast.startingBalance, forecast.currency),
      ),
      events: forecast.events.map((event) => ({
        ...event,
        amountFormatted: formatMoney(money(event.amount, forecast.currency)),
      })),
      points: forecast.points.map((point) => ({
        ...point,
        balanceFormatted: formatMoney(money(point.balance, forecast.currency)),
      })),
    };
  }

  @Get('credit-cards')
  async creditCards(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    const plans = await this.insights.creditCardPlans(userId, asOf);
    return plans.map((plan) => ({
      ...plan,
      utilizationPercent: Math.round(plan.utilization * 1000) / 10,
      balanceOwedFormatted: formatMoney(money(plan.balanceOwed, plan.currency)),
      creditLimitFormatted: formatMoney(money(plan.creditLimit, plan.currency)),
      payDownToThirtyPercentFormatted: formatMoney(money(plan.payDownToThirtyPercent, plan.currency)),
      recommendedPaymentFormatted: formatMoney(money(plan.recommendedPayment, plan.currency)),
    }));
  }

  @Get('purchase-scenario')
  async purchaseScenario(
    @CurrentUser() userId: string,
    @Query('amount') amount: string | undefined,
    @Query('date') date: string | undefined,
    @Query('days') days = '30',
    @Query('asOf') asOf?: string,
  ) {
    const parsedDays = Number(days);
    const parsedAmount = Number(amount);
    if (![7, 30, 90].includes(parsedDays)) {
      throw new BadRequestException('days must be one of 7, 30, or 90');
    }
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      throw new BadRequestException('amount must be a positive integer in minor units');
    }
    if (!date) throw new BadRequestException('date is required as YYYY-MM-DD');

    const scenario = await this.insights.purchaseScenario(userId, parsedDays, parsedAmount, date, asOf);
    return {
      ...scenario,
      purchase: {
        ...scenario.purchase,
        amountFormatted: formatMoney(money(scenario.purchase.amount, scenario.currency)),
      },
      balanceBeforePurchaseFormatted: formatMoney(money(scenario.balanceBeforePurchase, scenario.currency)),
      balanceAfterPurchaseFormatted: formatMoney(money(scenario.balanceAfterPurchase, scenario.currency)),
      endingBalanceFormatted: formatMoney(money(scenario.endingBalance, scenario.currency)),
    };
  }
}
