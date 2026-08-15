import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../models/models.dart';

/// A currency-safe history of actual observed balances. This is not a forecast:
/// points are written only after a bank sync or a manual balance change.
class NetWorthHistoryChart extends StatelessWidget {
  const NetWorthHistoryChart({required this.points, super.key});

  final List<NetWorthSnapshot> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final current = points.last;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.netWorthHistoryTitle, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(l10n.netWorthHistorySubtitle,
                style: theme.textTheme.bodySmall),
            const SizedBox(height: 14),
            Semantics(
              container: true,
              label: l10n.netWorthHistorySemantics(
                points.length,
                points.first.recordedOn,
                points.last.recordedOn,
                current.netPositionFormatted,
              ),
              child: ExcludeSemantics(
                child: SizedBox(
                  key: const Key('net-worth-history-chart'),
                  height: 170,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: _NetWorthHistoryPainter(
                      points: points,
                      lineColor: theme.colorScheme.primary,
                      fillColor: theme.colorScheme.primaryContainer,
                      axisColor: theme.colorScheme.outlineVariant,
                      negativeColor: theme.colorScheme.error,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${points.first.recordedOn} – ${points.last.recordedOn}',
                    style: theme.textTheme.labelSmall,
                  ),
                ),
                Text(
                  '${l10n.netWorthHistoryCurrent}: ${current.netPositionFormatted}',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: current.netPosition >= 0
                        ? theme.colorScheme.primary
                        : theme.colorScheme.error,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NetWorthHistoryPainter extends CustomPainter {
  const _NetWorthHistoryPainter({
    required this.points,
    required this.lineColor,
    required this.fillColor,
    required this.axisColor,
    required this.negativeColor,
  });

  final List<NetWorthSnapshot> points;
  final Color lineColor;
  final Color fillColor;
  final Color axisColor;
  final Color negativeColor;

  @override
  void paint(Canvas canvas, Size size) {
    const inset = 6.0;
    final width = math.max(1.0, size.width - inset * 2);
    final height = math.max(1.0, size.height - inset * 2);
    final values = points.map((point) => point.netPosition.toDouble()).toList();
    final minimum = math.min(0.0, values.reduce(math.min));
    final maximum = math.max(0.0, values.reduce(math.max));
    final span = math.max(1.0, maximum - minimum);
    double xFor(int index) => points.length == 1
        ? inset + width / 2
        : inset + width * index / (points.length - 1);
    double yFor(double value) =>
        inset + height - ((value - minimum) / span) * height;
    final zeroY = yFor(0);

    canvas.drawLine(
      Offset(inset, zeroY),
      Offset(inset + width, zeroY),
      Paint()
        ..color = axisColor
        ..strokeWidth = 1,
    );

    final line = Path();
    for (var index = 0; index < values.length; index++) {
      final point = Offset(xFor(index), yFor(values[index]));
      if (index == 0) {
        line.moveTo(point.dx, point.dy);
      } else {
        line.lineTo(point.dx, point.dy);
      }
    }

    if (points.length > 1) {
      final fill = Path.from(line)
        ..lineTo(xFor(points.length - 1), zeroY)
        ..lineTo(xFor(0), zeroY)
        ..close();
      canvas.drawPath(
        fill,
        Paint()
          ..color = fillColor.withValues(alpha: 0.42)
          ..style = PaintingStyle.fill,
      );
    }

    canvas.drawPath(
      line,
      Paint()
        ..color = currentColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    for (var index = 0; index < values.length; index++) {
      canvas.drawCircle(
        Offset(xFor(index), yFor(values[index])),
        points[index].netPosition >= 0 ? 3 : 4,
        Paint()
          ..color = points[index].netPosition >= 0 ? lineColor : negativeColor,
      );
    }
  }

  Color get currentColor =>
      points.last.netPosition >= 0 ? lineColor : negativeColor;

  @override
  bool shouldRepaint(covariant _NetWorthHistoryPainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.lineColor != lineColor ||
      oldDelegate.fillColor != fillColor ||
      oldDelegate.axisColor != axisColor ||
      oldDelegate.negativeColor != negativeColor;
}
