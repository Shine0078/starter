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
}
