import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { displayName } from '../../domain/categories';
import { answerFinancialQuestion } from '../../domain/assistant/financial-assistant';
import { StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { renderMonthlyReportPdf } from '../../infra/reports/monthly-report-pdf';
import { CurrentUser } from '../auth/auth.guard';
import { EntitlementGuard, RequiresEntitlement } from '../billing/entitlement.guard';
import { InsightsService } from './insights.service';

/**
 * Where the paywall falls, and why it falls here.
 *
 * The line is **the past against the future**. `insights`, `health-score`,
 * `subscriptions`, and `credit-cards` explain money already spent and stay free:
 * a finance app that shows a new user nothing cannot demonstrate it is worth
 * paying for. The forecast, the purchase simulator, and the monthly report
 * project *forward*, which is both the expensive work and the thing this
 * product is differentiated on — so that is what Pro buys.
 *
 * These gates are inert unless the deployment has a payment provider
 * configured (see BillingService.gatesEnforced). Nobody is ever refused a
 * feature for not paying on an instance where paying is impossible.
 *
 * Tiering itself is decided in one place — domain/billing/plans.ts — and the
 * price points and reasoning are in docs/09-pricing.md.
 */
@Controller()
@UseGuards(EntitlementGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('insights')
  async monthly(
    @CurrentUser() userId: string,
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
  ) {
    assertCurrency(currency);
    const report = await this.insights.monthlyReport(userId, asOf, currency);
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
      comparison: {
        income: comparisonMoney(summary.income, report.previous.income, summary.currency),
        expenses: comparisonMoney(summary.expenses, report.previous.expenses, summary.currency),
        netCashFlow: comparisonMoney(summary.netCashFlow, report.previous.netCashFlow, summary.currency),
        savingsRate: comparisonRate(summary.savingsRate, report.previous.savingsRate),
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

  @Get('analytics')
  async analytics(
    @CurrentUser() userId: string,
    @Query('period') period = 'month',
    @Query('asOf') asOf?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency = 'USD',
  ) {
    if (!['week', 'month', '3m', '6m', 'year', 'lifetime', 'custom'].includes(period)) {
      throw new BadRequestException('period must be week, month, 3m, 6m, lifetime, or custom.');
    }
    if (asOf && !isIsoCalendarDate(asOf)) {
      throw new BadRequestException('asOf must be a valid date in YYYY-MM-DD format.');
    }
    if (from && !isIsoCalendarDate(from)) {
      throw new BadRequestException('from must be a valid date in YYYY-MM-DD format.');
    }
    if (to && !isIsoCalendarDate(to)) {
      throw new BadRequestException('to must be a valid date in YYYY-MM-DD format.');
    }
    if ((period === 'custom' || from || to) && (!from || !to)) {
      throw new BadRequestException('custom analytics requires both from and to.');
    }
    if (from && to && from > to) {
      throw new BadRequestException('from cannot be after to.');
    }
    assertCurrency(currency);

    const report = await this.insights.analytics(
      userId,
      period as 'week' | 'month' | '3m' | '6m' | 'year' | 'lifetime' | 'custom',
      asOf,
      from && to ? { start: from, end: to } : undefined,
      currency,
    );
    const formatTotal = (total: number) => formatMoney(money(total, currency));
    return {
      ...report,
      grossExpensesFormatted: formatTotal(report.grossExpenses),
      refundsFormatted: formatTotal(report.refunds),
      refundMatches: report.refundMatches.map((match) => ({
        ...match,
        amountFormatted: formatTotal(match.amount),
        purchaseAmountFormatted: formatTotal(match.purchaseAmount),
      })),
      netExpensesFormatted: formatTotal(report.netExpenses),
      averageExpenseFormatted: formatTotal(report.averageExpense),
      medianExpenseFormatted: formatTotal(report.medianExpense),
      recurringSpendingFormatted: formatTotal(report.recurringSpending),
      discretionarySpendingFormatted: formatTotal(report.discretionarySpending),
      essentialSpendingFormatted: formatTotal(report.essentialSpending),
      totalIncomeFormatted: formatTotal(report.totalIncome),
      recurringIncomeFormatted: formatTotal(report.recurringIncome),
      irregularIncomeFormatted: formatTotal(report.irregularIncome),
      savingsFormatted: formatTotal(report.savings),
      averageMonthlySavingsFormatted: formatTotal(report.averageMonthlySavings),
      largestExpense: report.largestExpense && {
        ...report.largestExpense,
        amountFormatted: formatTotal(report.largestExpense.amount),
      },
      spendingByCategory: report.spendingByCategory.map((row) => ({
        categorySlug: row.key,
        categoryName: displayName(row.key),
        total: row.total,
        totalFormatted: formatTotal(row.total),
        transactionCount: row.count,
      })),
      spendingByMerchant: report.spendingByMerchant.map((row) => ({
        merchant: row.key,
        total: row.total,
        totalFormatted: formatTotal(row.total),
        transactionCount: row.count,
      })),
      spendingByAccount: report.spendingByAccount.map((row) => ({
        accountId: row.key,
        total: row.total,
        totalFormatted: formatTotal(row.total),
        transactionCount: row.count,
      })),
      incomeBySource: report.incomeBySource.map((row) => ({
        source: row.key,
        total: row.total,
        totalFormatted: formatTotal(row.total),
        transactionCount: row.count,
      })),
      velocity: {
        ...report.velocity,
        currentPeriodSpendFormatted: formatTotal(report.velocity.currentPeriodSpend),
        projectedPeriodSpendFormatted: formatTotal(report.velocity.projectedPeriodSpend),
        historicalAverageSpendFormatted: report.velocity.historicalAverageSpend === null
          ? null
          : formatTotal(report.velocity.historicalAverageSpend),
      },
      trend: report.trend.map((point) => ({
        ...point,
        incomeFormatted: formatTotal(point.income),
        expensesFormatted: formatTotal(point.expenses),
        refundsFormatted: formatTotal(point.refunds),
        netFormatted: formatTotal(point.net),
      })),
      timeline: report.timeline.map((event) => ({
        ...event,
        amountFormatted: formatTotal(event.amount),
      })),
    };
  }

  @Get('data-quality')
  async dataQuality(@CurrentUser() userId: string, @Query('asOf') asOf?: string) {
    if (asOf && !isIsoCalendarDate(asOf)) {
      throw new BadRequestException('asOf must be a valid date in YYYY-MM-DD format.');
    }
    return this.insights.dataQuality(userId, asOf);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequiresEntitlement('monthly_pdf_report')
  @Get('reports/monthly.pdf')
  async monthlyPdf(
    @CurrentUser() userId: string,
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
  ) {
    if (asOf && !isIsoCalendarDate(asOf)) {
      throw new BadRequestException('asOf must be a valid date in YYYY-MM-DD format.');
    }
    assertCurrency(currency);
    const bundle = await this.insights.professionalMonthlyReport(userId, asOf, currency);
    const pdf = await renderMonthlyReportPdf(bundle);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="finverse-monthly-report-${bundle.report.summary.period.start.slice(0, 7)}.pdf"`,
      length: pdf.length,
    });
  }

  @Get('subscriptions')
  async subscriptions(
    @CurrentUser() userId: string,
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
  ) {
    assertCurrency(currency);
    const result = await this.insights.subscriptions(userId, asOf, currency);
    return {
      count: result.subscriptions.length,
      currency,
      annualTotalFormatted: formatMoney(money(result.annualTotal, currency)),
      monthlyTotalFormatted: formatMoney(money(result.monthlyTotal, currency)),
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
  async healthScore(
    @CurrentUser() userId: string,
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
  ) {
    assertCurrency(currency);
    return this.insights.healthScore(userId, asOf, currency);
  }

  /**
   * Privacy-safe assistant fallback. It answers from server-side aggregates;
   * no raw ledger rows or user identifiers leave this process. A future
   * zero-retention LLM adapter can use the same response shape without making
   * the product dependent on an external model.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('assistant')
  async assistant(
    @CurrentUser() userId: string,
    @Query('question') question?: string,
    @Query('currency') currency = 'USD',
  ) {
    const normalizedQuestion = typeof question === 'string' ? question.trim() : '';
    if (normalizedQuestion.length < 2 || normalizedQuestion.length > 500) {
      throw new BadRequestException('question must be from 2 through 500 characters.');
    }
    assertCurrency(currency);

    const [report, subscriptions] = await Promise.all([
      this.insights.analytics(userId, 'month', undefined, undefined, currency),
      this.insights.subscriptions(userId, undefined, currency),
    ]);
    const answer = answerFinancialQuestion(normalizedQuestion, {
      report,
      subscriptions: subscriptions.subscriptions.filter((item) => item.currency === currency),
      formatMoney: (minorUnits) => formatMoney(money(minorUnits, currency)),
    });
    return {
      question: normalizedQuestion,
      period: report.period,
      currency,
      ...answer,
    };
  }

  @RequiresEntitlement('cash_flow_planning')
  @Get('cash-flow-forecast')
  async cashFlowForecast(
    @CurrentUser() userId: string,
    @Query('days') days = '30',
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
  ) {
    const parsedDays = Number(days);
    if (![7, 30, 90].includes(parsedDays)) {
      // These are deliberately curated product horizons, not an arbitrary
      // graph length a client can accidentally turn into a false forecast.
      throw new BadRequestException('days must be one of 7, 30, or 90');
    }
    assertCurrency(currency);

    const forecast = await this.insights.cashFlowForecast(
      userId,
      parsedDays,
      asOf,
      currency,
    );
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

  @RequiresEntitlement('cash_flow_planning')
  @Get('purchase-scenario')
  async purchaseScenario(
    @CurrentUser() userId: string,
    @Query('amount') amount: string | undefined,
    @Query('date') date: string | undefined,
    @Query('days') days = '30',
    @Query('asOf') asOf?: string,
    @Query('currency') currency = 'USD',
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
    assertCurrency(currency);

    const scenario = await this.insights.purchaseScenario(
      userId,
      parsedDays,
      parsedAmount,
      date,
      asOf,
      currency,
    );
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

/**
 * Present a comparison as a small, safe sentence rather than exposing the
 * raw previous-period summary. A missing previous baseline remains explicit;
 * it must not become a misleading 100% claim.
 */
function comparisonMoney(current: number, previous: number, currency: string): string | null {
  const delta = current - previous;
  if (delta === 0) return null;
  const direction = delta > 0 ? 'higher' : 'lower';
  const magnitude = formatMoney(money(Math.abs(delta), currency));
  if (previous === 0) return `${magnitude} ${direction} than last period`;
  const percent = Math.round((Math.abs(delta) / Math.abs(previous)) * 100);
  return `${magnitude} (${percent}%) ${direction} than last period`;
}

function comparisonRate(current: number, previous: number): string | null {
  const delta = current - previous;
  if (Math.abs(delta) < 0.05) return null;
  return `${Math.abs(delta).toFixed(1)} percentage points ${delta > 0 ? 'higher' : 'lower'} than last period`;
}

function assertCurrency(value: string): void {
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new BadRequestException('currency must be an uppercase 3-letter ISO code');
  }
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
