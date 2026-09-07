import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../design/design.dart';
import '../models/models.dart';

/// A period cash-flow Sankey built from the same server-side analytics data as
/// the surrounding report. The canvas is decorative; the legend and summary
/// provide a complete, scalable spoken and visual equivalent.
class CashFlowSankey extends StatelessWidget {
  const CashFlowSankey({
    required this.incomeSources,
    required this.expenseCategories,
    required this.currency,
    required this.totalIncome,
    required this.totalExpenses,
    super.key,
  });

  final List<AnalyticsBucket> incomeSources;
  final List<AnalyticsBucket> expenseCategories;
  final String currency;
  final int totalIncome;
  final int totalExpenses;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;
    final sourceRows = _flowRows(
      incomeSources,
      maximum: 3,
      otherLabel: 'Other income',
      colors: [fin.income],
    );
    final categoryRows = _flowRows(
      expenseCategories,
      maximum: 6,
      otherLabel: 'Other spending',
      colors: fin.chartSeries,
    );
    final income = math.max(
      math.max(totalIncome, 0),
      sourceRows.fold<int>(0, (sum, row) => sum + row.amount),
    );
    final expenses = math.max(
      math.max(totalExpenses, 0),
      categoryRows.fold<int>(0, (sum, row) => sum + row.amount),
    );
    final funding = math.max(income, expenses);

    if (funding == 0) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Money flow', style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'How income moved through this period',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              Text(
                'No income or spending is available for this period.',
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
        ),
      );
    }

    final sources = [...sourceRows];
    final capturedIncome = sources.fold<int>(0, (sum, row) => sum + row.amount);
    if (income > capturedIncome) {
      sources.add(_FlowRow(
        label: sourceRows.isEmpty ? 'Income' : 'Other income',
        amount: income - capturedIncome,
        color: fin.income,
      ));
    }
    if (expenses > income) {
      sources.add(_FlowRow(
        label: 'Opening balance / credit',
        amount: expenses - income,
        color: fin.warning,
      ));
    }

    final destinations = [...categoryRows];
    final capturedExpenses = destinations.fold<int>(
      0,
      (sum, row) => sum + row.amount,
    );
    if (expenses > capturedExpenses) {
      destinations.add(_FlowRow(
        label: 'Other spending',
        amount: expenses - capturedExpenses,
        color: fin.neutral,
      ));
    }
    if (income > expenses) {
      destinations.add(_FlowRow(
        label: 'Savings / remaining',
        amount: income - expenses,
        color: fin.income,
      ));
    }

    final summary = 'Money flow for this period in $currency. '
        'Income ${_money(income, currency)}; '
        'spending ${_money(expenses, currency)}; '
        '${income >= expenses ? 'savings' : 'funding gap'} '
        '${_money((income - expenses).abs(), currency)}.';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Money flow', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'How income moved through this period',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Semantics(
              container: true,
              label: summary,
              child: ExcludeSemantics(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final width = math.max(constraints.maxWidth, 720.0);
                    return SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: SizedBox(
                        key: const Key('cash-flow-sankey'),
                        width: width,
                        height: 330,
                        child: CustomPaint(
                          painter: _SankeyPainter(
                            sources: sources,
                            destinations: destinations,
                            total: funding,
                            currency: currency,
                            centerColor: theme.colorScheme.primary,
                            labelColor: theme.colorScheme.onSurface,
                            labelBackground: theme.colorScheme.surface,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 10,
              children: [
                for (final row in destinations)
                  _FlowLegend(row: row, currency: currency),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FlowLegend extends StatelessWidget {
  const _FlowLegend({required this.row, required this.currency});

  final _FlowRow row;
  final String currency;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 220,
        child: Semantics(
          label: '${row.label}: ${_money(row.amount, currency)}.',
          child: ExcludeSemantics(
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: row.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text('${row.label}  ${_money(row.amount, currency)}'),
                ),
              ],
            ),
          ),
        ),
      );
}

class _FlowRow {
  const _FlowRow({
    required this.label,
    required this.amount,
    required this.color,
  });

  final String label;
  final int amount;
  final Color color;
}

List<_FlowRow> _flowRows(
  List<AnalyticsBucket> buckets, {
  required int maximum,
  required String otherLabel,
  required List<Color> colors,
}) {
  final ordered = buckets.where((row) => row.total > 0).toList()
    ..sort((a, b) => b.total.compareTo(a.total));
  if (ordered.isEmpty) return [];

  final visibleCount = ordered.length > maximum ? maximum - 1 : maximum;
  final visible = ordered.take(visibleCount).toList();
  final rows = <_FlowRow>[
    for (var index = 0; index < visible.length; index++)
      _FlowRow(
        label: visible[index].label,
        amount: visible[index].total,
        color: colors[index % colors.length],
      ),
  ];
  if (ordered.length > visible.length) {
    rows.add(_FlowRow(
      label: otherLabel,
      amount: ordered
          .skip(visible.length)
          .fold<int>(0, (sum, row) => sum + row.total),
      color: colors[visible.length % colors.length],
    ));
  }
  return rows;
}

class _SankeyPainter extends CustomPainter {
  const _SankeyPainter({
    required this.sources,
    required this.destinations,
    required this.total,
    required this.currency,
    required this.centerColor,
    required this.labelColor,
    required this.labelBackground,
  });

  final List<_FlowRow> sources;
  final List<_FlowRow> destinations;
  final int total;
  final String currency;
  final Color centerColor;
  final Color labelColor;
  final Color labelBackground;

  static const _nodeWidth = 9.0;
  static const _top = 14.0;
  static const _bottom = 14.0;

  @override
  void paint(Canvas canvas, Size size) {
    final height = size.height - _top - _bottom;
    final sourceX = 126.0;
    final centerX = size.width * 0.46;
    final destinationX = size.width - 154.0;
    final sourceRects = _nodeRects(sources, sourceX, height);
    final destinationRects = _nodeRects(destinations, destinationX, height);
    final center = Rect.fromLTWH(centerX, _top, _nodeWidth, height);

    var centerSourceY = center.top;
    for (var index = 0; index < sources.length; index++) {
      final row = sources[index];
      final centerHeight = height * row.amount / total;
      _drawRibbon(
        canvas,
        start: Offset(
          sourceRects[index].right,
          sourceRects[index].center.dy,
        ),
        startHeight: sourceRects[index].height,
        end: Offset(center.left, centerSourceY + centerHeight / 2),
        endHeight: centerHeight,
        color: row.color,
      );
      centerSourceY += centerHeight;
    }

    var centerDestinationY = center.top;
    for (var index = 0; index < destinations.length; index++) {
      final row = destinations[index];
      final centerHeight = height * row.amount / total;
      _drawRibbon(
        canvas,
        start: Offset(center.right, centerDestinationY + centerHeight / 2),
        startHeight: centerHeight,
        end: Offset(
          destinationRects[index].left,
          destinationRects[index].center.dy,
        ),
        endHeight: destinationRects[index].height,
        color: row.color,
      );
      centerDestinationY += centerHeight;
    }

    for (var index = 0; index < sources.length; index++) {
      canvas.drawRect(
          sourceRects[index], Paint()..color = sources[index].color);
    }
    canvas.drawRect(center, Paint()..color = centerColor);
    for (var index = 0; index < destinations.length; index++) {
      canvas.drawRect(
        destinationRects[index],
        Paint()..color = destinations[index].color,
      );
    }

    var nextSourceLabelY = 0.0;
    for (var index = 0; index < sources.length; index++) {
      final labelY = math.max(
        sourceRects[index].center.dy - 14,
        nextSourceLabelY,
      );
      _drawLabel(
        canvas,
        row: sources[index],
        x: 0,
        y: labelY,
        width: sourceX - 10,
        canvasHeight: size.height,
        align: TextAlign.right,
      );
      nextSourceLabelY = labelY + 30;
    }
    _drawCenterLabel(canvas, center, size.width);
    var nextDestinationLabelY = 0.0;
    for (var index = 0; index < destinations.length; index++) {
      final labelY = math.max(
        destinationRects[index].center.dy - 14,
        nextDestinationLabelY,
      );
      _drawLabel(
        canvas,
        row: destinations[index],
        x: destinationX + 15,
        y: labelY,
        width: size.width - destinationX - 17,
        canvasHeight: size.height,
        align: TextAlign.left,
      );
      nextDestinationLabelY = labelY + 30;
    }
  }

  List<Rect> _nodeRects(List<_FlowRow> rows, double x, double height) {
    if (rows.isEmpty) return [];
    const gap = 8.0;
    final available = math.max(height - gap * (rows.length - 1), 1.0);
    var y = _top;
    return rows.map((row) {
      final rowHeight = available * row.amount / total;
      final rect = Rect.fromLTWH(x, y, _nodeWidth, rowHeight);
      y += rowHeight + gap;
      return rect;
    }).toList();
  }

  void _drawRibbon(
    Canvas canvas, {
    required Offset start,
    required double startHeight,
    required Offset end,
    required double endHeight,
    required Color color,
  }) {
    final controlX = (start.dx + end.dx) / 2;
    final path = Path()
      ..moveTo(start.dx, start.dy - startHeight / 2)
      ..cubicTo(
        controlX,
        start.dy - startHeight / 2,
        controlX,
        end.dy - endHeight / 2,
        end.dx,
        end.dy - endHeight / 2,
      )
      ..lineTo(end.dx, end.dy + endHeight / 2)
      ..cubicTo(
        controlX,
        end.dy + endHeight / 2,
        controlX,
        start.dy + startHeight / 2,
        start.dx,
        start.dy + startHeight / 2,
      )
      ..close();
    canvas.drawPath(path, Paint()..color = color.withValues(alpha: 0.36));
  }

  void _drawLabel(
    Canvas canvas, {
    required _FlowRow row,
    required double x,
    required double y,
    required double width,
    required double canvasHeight,
    required TextAlign align,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        style: TextStyle(color: labelColor, fontSize: 11, height: 1.15),
        children: [
          TextSpan(text: '${row.label}\n'),
          TextSpan(
            text: _money(row.amount, currency),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
      textAlign: align,
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
    )..layout(maxWidth: width);
    painter.paint(
      canvas,
      Offset(x, y.clamp(0, canvasHeight - painter.height).toDouble()),
    );
  }

  void _drawCenterLabel(Canvas canvas, Rect center, double width) {
    final painter = TextPainter(
      text: TextSpan(
        style: TextStyle(color: labelColor, fontSize: 11, height: 1.15),
        children: [
          const TextSpan(text: 'Available cash\n'),
          TextSpan(
            text: _money(total, currency),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: math.min(120, width - center.right - 10));
    final offset = Offset(center.right + 9, center.top + 5);
    final background = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        offset.dx - 4,
        offset.dy - 3,
        painter.width + 8,
        painter.height + 6,
      ),
      const Radius.circular(3),
    );
    canvas.drawRRect(
        background, Paint()..color = labelBackground.withValues(alpha: 0.88));
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _SankeyPainter oldDelegate) =>
      oldDelegate.sources != sources ||
      oldDelegate.destinations != destinations ||
      oldDelegate.total != total ||
      oldDelegate.currency != currency ||
      oldDelegate.centerColor != centerColor ||
      oldDelegate.labelColor != labelColor ||
      oldDelegate.labelBackground != labelBackground;
}

String _money(int minorUnits, String currency) =>
    '$currency ${NumberFormat.currency(
      symbol: '',
      decimalDigits: 2,
    ).format(minorUnits / 100).trim()}';
