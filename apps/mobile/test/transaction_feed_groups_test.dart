import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/models/models.dart';
import 'package:finverse/screens/transaction_feed_groups.dart';

Transaction _transaction(String id, String postedAt) => Transaction(
      id: id,
      accountId: 'account-1',
      postedAt: postedAt,
      amount: -1250,
      currency: 'USD',
      amountFormatted: r'-$12.50',
      rawDescriptor: 'COFFEE SHOP',
      normalizedDescriptor: 'coffee shop',
      categorySlug: 'coffee',
      categorySource: 'lexicon',
      categoryConfidence: 0.9,
      pending: false,
      isRecurring: false,
    );

void main() {
  test('groups same-day transactions and labels relative dates', () {
    final groups = groupTransactionsByDate(
      [
        _transaction('today-1', '2026-08-10'),
        _transaction('today-2', '2026-08-10'),
        _transaction('yesterday', '2026-08-09'),
        _transaction('older', '2026-07-31'),
      ],
      today: DateTime(2026, 8, 10),
    );

    expect(groups.map((group) => group.label), [
      'Today',
      'Yesterday',
      'July 31, 2026',
    ]);
    expect(groups[0].transactions.map((row) => row.id), ['today-1', 'today-2']);
  });

  test('keeps malformed provider dates visible instead of dropping rows', () {
    final groups = groupTransactionsByDate([
      _transaction('bad-date', 'unknown-date'),
    ]);

    expect(groups.single.label, 'unknown-date');
    expect(groups.single.transactions.single.id, 'bad-date');
  });
}
