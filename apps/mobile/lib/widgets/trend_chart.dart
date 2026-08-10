import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/models.dart';

/// A compact line chart answering one useful question: did money in or money
/// out move more during the selected period? It deliberately avoids a chart
/// package so the visual stays lightweight, testable, and accessible.
class TrendChart extends StatelessWidget {
  const TrendChart({required this.points, super.key});

  final List<AnalyticsTrendPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final income = points.reduce((a, b) => a.income >= b.income ? a : b);
    final expenses = points.reduce((a, b) => a.expenses >= b.expenses ? a : b);
    final semantics = 'Income versus spending line chart across '
        '${points.length} period${points.length == 1 ? '' : 's'}. '
        'Highest income ${income.incomeFormatted}; '
        'highest spending ${expenses.expensesFormatted}.';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Income vs spending', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'How cash flow changed over this period',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Semantics(
              container: true,
              label: semantics,
              child: ExcludeSemantics(
                child: SizedBox(
                  key: const Key('analytics-trend-chart'),
                  height: 170,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: _TrendChartPainter(
                      points: points,
                      incomeColor: theme.colorScheme.primary,
                      expenseColor: theme.colorScheme.error,
                      axisColor: theme.colorScheme.outlineVariant,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                _Legend(color: theme.colorScheme.primary, label: 'Income'),
                _Legend(color: theme.colorScheme.error, label: 'Spending'),
                Text(
                  '${points.first.date} - ${points.last.date}',
                  style: theme.textTheme.labelSmall,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 18,
            height: 3,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          const SizedBox(width: 6),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      );
}

class _TrendChartPainter extends CustomPainter {
  const _TrendChartPainter({
    required this.points,
    required this.incomeColor,
    required this.expenseColor,
    required this.axisColor,
  });

  final List<AnalyticsTrendPoint> points;
  final Color incomeColor;
  final Color expenseColor;
  final Color axisColor;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 4.0;
    const right = 4.0;
    const top = 8.0;
    const bottom = 12.0;
    final plotWidth = math.max(size.width - left - right, 1);
    final plotHeight = math.max(size.height - top - bottom, 1);
    final maximum = points.fold<double>(1, (current, point) => math.max(
          current,
          math.max(point.income.toDouble(), point.expenses.toDouble()),
        ));

    final axis = Paint()
      ..color = axisColor
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(left, top + plotHeight),
      Offset(left + plotWidth, top + plotHeight),
      axis,
    );

    Path pathFor(int Function(AnalyticsTrendPoint) value) {
      final path = Path();
      for (var index = 0; index < points.length; index++) {
        final x = points.length == 1
            ? left + plotWidth / 2
            : left + plotWidth * index / (points.length - 1);
        final y = top + plotHeight -
            (value(points[index]).clamp(0, maximum) / maximum) * plotHeight;
        if (index == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      return path;
    }

    void drawSeries(int Function(AnalyticsTrendPoint) value, Color color) {
      final paint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      canvas.drawPath(pathFor(value), paint);
    }

    drawSeries((point) => point.income, incomeColor);
    drawSeries((point) => point.expenses, expenseColor);
  }

  @override
  bool shouldRepaint(covariant _TrendChartPainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.incomeColor != incomeColor ||
      oldDelegate.expenseColor != expenseColor ||
      oldDelegate.axisColor != axisColor;
}
