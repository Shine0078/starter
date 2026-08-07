import 'package:flutter/material.dart';

import '../models/models.dart';

class BudgetTile extends StatelessWidget {
  const BudgetTile({required this.progress, super.key});

  final BudgetProgress progress;

  Color _statusColor(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (progress.status) {
      'exceeded' => scheme.error,
      'critical' => Colors.deepOrange.shade600,
      'warning' => Colors.orange.shade700,
      _ => scheme.primary,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _statusColor(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(progress.categoryName, style: theme.textTheme.titleSmall),
                Text(
                  '${progress.spentFormatted} / ${progress.limitFormatted}',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                // Clamped so an exceeded budget renders a full bar rather than
                // overflowing; the "over budget" text carries the overage.
                value: (progress.percentUsed / 100).clamp(0.0, 1.0),
                minHeight: 6,
                color: color,
                backgroundColor: theme.colorScheme.surfaceContainerHighest,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  progress.isExceeded
                      ? 'Over budget by ${progress.remainingFormatted.replaceAll('-', '')}'
                      : '${progress.remainingFormatted} left',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: progress.isExceeded ? color : null,
                  ),
                ),
                Text(
                  '${progress.daysRemaining} days left',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
            if (progress.projectedToExceed && !progress.isExceeded) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.speed, size: 14, color: color),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      "At this pace you'll go over before the period ends.",
                      style: theme.textTheme.bodySmall?.copyWith(color: color),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
