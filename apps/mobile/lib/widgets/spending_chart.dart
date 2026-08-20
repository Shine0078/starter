import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/design.dart';
import '../models/models.dart';

/// Category spending as a donut plus a legend.
///
/// The donut gives the shape of the month at a glance; the legend keeps every
/// category individually announced, because a colour patch alone would vanish
/// in greyscale or to a colour-blind reader (MISSION2 §41).
class SpendingChart extends StatelessWidget {
  const SpendingChart({
    required this.categories,
    this.onCategorySelected,
    super.key,
  });

  final List<CategorySpend> categories;
  final ValueChanged<CategorySpend>? onCategorySelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;
    final rows = categories.take(6).toList();
    final series = fin.chartSeries;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Spending by category', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Where this month went',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            if (rows.isEmpty)
              Text('No categorized spending yet.',
                  style: theme.textTheme.bodyMedium)
            else ...[
              Center(
                child: ExcludeSemantics(
                  child: SizedBox(
                    width: 148,
                    height: 148,
                    child: CustomPaint(
                      painter: _DonutPainter(
                        segments: [
                          for (var i = 0; i < rows.length; i++)
                            _Segment(
                              value: rows[i].total.toDouble(),
                              color: series[i % series.length],
                            ),
                        ],
                        trackColor: theme.colorScheme.surfaceContainerHighest,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              for (final row in rows) ...[
                Semantics(
                  container: true,
                  label:
                      '${row.categoryName}: ${row.totalFormatted} across ${row.transactionCount} transaction${row.transactionCount == 1 ? '' : 's'}.',
                  child: ExcludeSemantics(
                    child: InkWell(
                      onTap: onCategorySelected == null
                          ? null
                          : () => onCategorySelected!(row),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: series[rows.indexOf(row) % series.length],
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                row.categoryName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                row.totalFormatted,
                                style: theme.textTheme.labelLarge?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                                textAlign: TextAlign.end,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _Segment {
  const _Segment({required this.value, required this.color});
  final double value;
  final Color color;
}

class _DonutPainter extends CustomPainter {
  const _DonutPainter({required this.segments, required this.trackColor});

  final List<_Segment> segments;
  final Color trackColor;

  static const _strokeWidth = 22.0;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) - _strokeWidth) / 2;
    final total = segments.fold<double>(0, (sum, segment) => sum + segment.value);
    if (total <= 0) {
      final track = Paint()
        ..color = trackColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth;
      canvas.drawCircle(center, radius, track);
      return;
    }

    final rect = Rect.fromCircle(center: center, radius: radius);
    var startAngle = -math.pi / 2;

    for (final segment in segments) {
      if (segment.value <= 0) continue;
      final sweep = segment.value / total * 2 * math.pi;
      final paint = Paint()
        ..color = segment.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..strokeCap = StrokeCap.butt;
      canvas.drawArc(rect, startAngle, sweep, false, paint);
      startAngle += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) =>
      oldDelegate.segments != segments || oldDelegate.trackColor != trackColor;
}
