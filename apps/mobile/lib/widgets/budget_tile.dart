import 'package:flutter/material.dart';

import '../design/design.dart';
import '../models/models.dart';

/// One budget's spend against its limit.
///
/// A monogram avatar marks each row at a glance without leaning on an icon
/// library that has no entry for "streaming"; the bar and the words carry the
/// actual state (MISSION2 §41 — colour is never the only signal).
class BudgetTile extends StatelessWidget {
  const BudgetTile({required this.progress, super.key});

  final BudgetProgress progress;

  Color _statusColor(BuildContext context) {
    final fin = context.finColors;
    return switch (progress.status) {
      'exceeded' || 'critical' => fin.expense,
      'warning' => fin.warning,
      _ => fin.income,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _statusColor(context);

    final status = progress.isExceeded
        ? 'Over budget by ${progress.remainingFormatted.replaceAll('-', '')}'
        : '${progress.remainingFormatted} left';

    return Semantics(
      container: true,
      label:
          '${progress.categoryName} budget. ${progress.spentFormatted} spent of ${progress.limitFormatted}. ${progress.percentUsed.toStringAsFixed(0)} percent used. $status. ${progress.daysRemaining} days left.${progress.projectedToExceed && !progress.isExceeded ? ' Projected to exceed at the current pace.' : ''}',
      child: ExcludeSemantics(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: color.withValues(alpha: 0.14),
                  child: Text(
                    _initial(progress.categoryName),
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(progress.categoryName,
                                style: theme.textTheme.titleSmall),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              '${progress.spentFormatted} / ${progress.limitFormatted}',
                              style: theme.textTheme.bodySmall,
                              textAlign: TextAlign.end,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          // Clamped so an exceeded budget renders a full bar rather
                          // than overflowing; the "over budget" text carries the overage.
                          value: (progress.percentUsed / 100).clamp(0.0, 1.0),
                          minHeight: 6,
                          color: color,
                          backgroundColor:
                              theme.colorScheme.surfaceContainerHighest,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              status,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: progress.isExceeded ? color : null,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              '${progress.daysRemaining} days left',
                              style: theme.textTheme.bodySmall,
                              textAlign: TextAlign.end,
                            ),
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
                                style: theme.textTheme.bodySmall
                                    ?.copyWith(color: color),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _initial(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '•';
    return trimmed[0].toUpperCase();
  }
}
