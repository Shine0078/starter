import 'package:flutter/material.dart';

import '../models/models.dart';

/// Daily spending intensity for the selected analytics period.
///
/// Uses the same same-currency daily expense totals as [TrendChart]. Empty
/// days stay visible so the calendar is not more confident than the ledger.
class SpendingHeatmap extends StatelessWidget {
  const SpendingHeatmap({required this.points, super.key});

  final List<AnalyticsTrendPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final peak = points.fold<int>(0, (max, point) => point.expenses > max ? point.expenses : max);
    final peakPoint = points.reduce((a, b) => a.expenses >= b.expenses ? a : b);
    final spentDays = points.where((point) => point.expenses > 0).length;
    final firstDate = DateTime.parse(points.first.date);
    final weekdayOffset = firstDate.weekday % 7;
    final cells = <AnalyticsTrendPoint?>[
      for (var i = 0; i < weekdayOffset; i++) null,
      ...points,
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    final weeks = <List<AnalyticsTrendPoint?>>[];
    for (var i = 0; i < cells.length; i += 7) {
      weeks.add(cells.sublist(i, i + 7));
    }
    final semantics = 'Daily spending heatmap across ${points.length} days. '
        '$spentDays day${spentDays == 1 ? '' : 's'} had spending. '
        'Highest spending ${peakPoint.expensesFormatted} on ${peakPoint.date}.';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Daily spending', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Intensity of settled spending in this currency. Blank days had none.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Semantics(
              container: true,
              label: semantics,
              child: ExcludeSemantics(
                child: Column(
                  children: [
                    Row(
                      children: [
                        for (final label in const ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
                          Expanded(
                            child: Text(
                              label,
                              textAlign: TextAlign.center,
                              style: theme.textTheme.labelSmall,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    for (final week in weeks)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          children: [
                            for (final point in week)
                              Expanded(
                                child: AspectRatio(
                                  aspectRatio: 1,
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      color: _colorFor(theme, point, peak),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _colorFor(ThemeData theme, AnalyticsTrendPoint? point, int peak) {
    if (point == null) return Colors.transparent;
    if (point.expenses <= 0 || peak <= 0) {
      return theme.colorScheme.surfaceContainerHighest;
    }
    final t = (point.expenses / peak).clamp(0.15, 1.0);
    return Color.lerp(
      theme.colorScheme.primary.withValues(alpha: 0.18),
      theme.colorScheme.primary,
      t,
    )!;
  }
}
