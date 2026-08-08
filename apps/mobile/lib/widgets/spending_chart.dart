import 'package:flutter/material.dart';

import '../models/models.dart';

class SpendingChart extends StatelessWidget {
  const SpendingChart({required this.categories, super.key});

  final List<CategorySpend> categories;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = categories.take(6).toList();
    final maximum = rows.fold<int>(
        1, (value, row) => row.total > value ? row.total : value);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Spending by category', style: theme.textTheme.titleMedium),
            const SizedBox(height: 14),
            for (final row in rows) ...[
              Row(
                children: [
                  Expanded(child: Text(row.categoryName)),
                  Text(row.totalFormatted, style: theme.textTheme.labelLarge),
                ],
              ),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: row.total / maximum,
                  minHeight: 10,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                ),
              ),
              const SizedBox(height: 11),
            ],
          ],
        ),
      ),
    );
  }
}
