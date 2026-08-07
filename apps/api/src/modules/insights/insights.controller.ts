import { Controller, Get, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../current-user';
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
}
