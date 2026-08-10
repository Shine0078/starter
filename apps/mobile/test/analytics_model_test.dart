import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/models/models.dart';

void main() {
  test('parses server-side analytics including velocity and timeline', () {
    final report = AnalyticsReport.fromJson({
      'period': {'start': '2026-08-01', 'end': '2026-08-31'},
      'currency': 'USD',
      'grossExpenses': 10000,
      'grossExpensesFormatted': r'$100.00',
      'refundsFormatted': r'$5.00',
      'refundMatches': [
        {
          'refundId': 'refund-1',
          'purchaseId': 'purchase-1',
          'amountFormatted': r'$10.00',
          'purchaseAmountFormatted': r'$50.00',
          'merchant': 'Example Shop',
          'purchaseDate': '2026-07-01',
          'refundDate': '2026-07-07',
          'daysAfterPurchase': 5,
          'confidence': 0.88,
        },
      ],
      'netExpensesFormatted': r'$95.00',
      'expenseCount': 2,
      'averageExpenseFormatted': r'$50.00',
      'medianExpenseFormatted': r'$50.00',
      'largestExpense': {
        'id': 'txn-1',
        'date': '2026-08-10',
        'label': 'Store',
        'kind': 'expense',
        'amount': -7500,
        'amountFormatted': r'-$75.00',
        'accountId': 'account-1',
      },
      'spendingByCategory': [
        {
          'categorySlug': 'groceries',
          'categoryName': 'Groceries',
          'total': 10000,
          'totalFormatted': r'$100.00',
          'transactionCount': 2,
        },
      ],
      'spendingByMerchant': [],
      'spendingByAccount': [],
      'recurringSpendingFormatted': r'$0.00',
      'discretionarySpendingFormatted': r'$0.00',
      'essentialSpendingFormatted': r'$100.00',
      'totalIncomeFormatted': r'$200.00',
      'recurringIncomeFormatted': r'$200.00',
      'irregularIncomeFormatted': r'$0.00',
      'incomeBySource': [],
      'savingsFormatted': r'$105.00',
      'savingsRate': 52.5,
      'averageMonthlySavingsFormatted': r'$105.00',
      'velocity': {
        'currentPeriodSpend': 10000,
        'currentPeriodSpendFormatted': r'$100.00',
        'projectedPeriodSpend': 12000,
        'projectedPeriodSpendFormatted': r'$120.00',
        'historicalAverageSpend': 9000,
        'historicalAverageSpendFormatted': r'$90.00',
        'percentDelta': 33.3,
        'enoughHistory': true,
      },
      'timeline': [],
    });

    expect(report.periodStart, '2026-08-01');
    expect(report.spendingByCategory.single.label, 'Groceries');
    expect(report.velocity.percentDelta, 33.3);
    expect(report.largestExpense?.amountFormatted, r'-$75.00');
  });

  test('parses the privacy-safe assistant answer and evidence', () {
    final answer = AssistantAnswer.fromJson({
      'question': 'Where did I spend the most?',
      'intent': 'top_category',
      'answer': 'Restaurants were your largest category.',
      'facts': [
        {'label': 'Restaurants', 'value': r'$600.00'},
      ],
      'source': 'deterministic',
      'caveat': 'Based on posted transactions.',
    });

    expect(answer.intent, 'top_category');
    expect(answer.facts.single.value, r'$600.00');
    expect(answer.source, 'deterministic');
  });

  test('parses safe period comparisons for the home dashboard', () {
    final report = InsightsReport.fromJson({
      'headline': {
        'income': r'\$1,000.00',
        'expenses': r'\$400.00',
        'netCashFlow': r'\$600.00',
        'savingsRate': '60.0%',
      },
      'topCategories': [],
      'insights': [],
      'comparison': {
        'income': r'\$100.00 (11%) higher than last period',
        'expenses': r'\$50.00 (14%) lower than last period',
        'netCashFlow': null,
        'savingsRate': '5.0 percentage points higher than last period',
      },
    });

    expect(report.comparison?.income, contains('higher'));
    expect(report.comparison?.expenses, contains('lower'));
    expect(report.comparison?.netCashFlow, isNull);
    expect(report.comparison?.hasAny, isTrue);
  });
}
