import 'package:intl/intl.dart';

import '../models/models.dart';

/// A date section in the transaction feed.
///
/// The API already returns rows newest-first, but grouping by a stable calendar
/// key also keeps the UI correct when an offline cache or a test double returns
/// rows in a different order.
class TransactionDateGroup {
  const TransactionDateGroup({required this.label, required this.transactions});

  final String label;
  final List<Transaction> transactions;
}

/// Groups transactions by their bank-provided calendar date without converting
/// the date through UTC. Bank dates represent a user's calendar day, not an
/// instant in time; converting them at midnight can move a transaction across
/// a section boundary for users west or east of UTC.
List<TransactionDateGroup> groupTransactionsByDate(
  Iterable<Transaction> transactions, {
  DateTime? today,
}) {
  final reference = today ?? DateTime.now();
  final referenceDate =
      DateTime(reference.year, reference.month, reference.day);
  // Dart's map literal preserves insertion order, which keeps the feed's
  // newest-first section order while still coalescing non-contiguous dates.
  final grouped = <String, List<Transaction>>{};
  final labels = <String, String>{};

  for (final transaction in transactions) {
    final parsed = DateTime.tryParse(transaction.postedAt);
    final key = parsed == null
        ? transaction.postedAt
        : _dateKey(parsed.year, parsed.month, parsed.day);
    grouped.putIfAbsent(key, () => <Transaction>[]).add(transaction);
    labels.putIfAbsent(
      key,
      () => parsed == null
          ? transaction.postedAt
          : _labelFor(
              DateTime(parsed.year, parsed.month, parsed.day), referenceDate),
    );
  }

  return grouped.entries
      .map((entry) => TransactionDateGroup(
            label: labels[entry.key]!,
            transactions: List.unmodifiable(entry.value),
          ))
      .toList(growable: false);
}

String _dateKey(int year, int month, int day) =>
    '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

String _labelFor(DateTime date, DateTime today) {
  final difference = today.difference(date).inDays;
  if (difference == 0) return 'Today';
  if (difference == 1) return 'Yesterday';
  return DateFormat.yMMMMd().format(date);
}
