import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/design.dart';
import '../models/models.dart';

/// The 0–1000 score, its components, and what to do about it.
///
/// The component breakdown is not optional decoration. A score that moves
/// without explanation is worse than no score, so the card always shows what
/// each part contributed and the actions that would raise it.
class HealthScoreCard extends StatelessWidget {
  const HealthScoreCard({required this.score, super.key});

  final HealthScore score;

  Color _bandColor(BuildContext context) {
    final fin = context.finColors;
    return switch (score.band) {
      'excellent' || 'good' => fin.income,
      'fair' => fin.warning,
      _ => fin.expense,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;
    final color = _bandColor(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              container: true,
              label:
                  'Financial health score ${score.score} out of 1000, ${score.band}.',
              child: ExcludeSemantics(
                child: Row(
                  children: [
                    SizedBox(
                      width: 96,
                      height: 96,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          CustomPaint(
                            size: const Size(96, 96),
                            painter: _ScoreGaugePainter(
                              fraction: (score.score / 1000).clamp(0.0, 1.0),
                              color: color,
                              trackColor:
                                  theme.colorScheme.surfaceContainerHighest,
                            ),
                          ),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Text(
                                '${score.score}',
                                style: theme.textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: color,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Financial health',
                              style: theme.textTheme.titleMedium),
                          const SizedBox(height: 4),
                          Text(
                            'out of 1000 points',
                            style: theme.textTheme.bodySmall,
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.14),
                                  borderRadius: FinRadius.pillBorder,
                                ),
                                child: Text(
                                  score.band,
                                  style: theme.textTheme.labelMedium?.copyWith(
                                    color: color,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            ...score.components.map(
              (component) => Semantics(
                container: true,
                label:
                    '${component.label}: ${component.points} of ${component.maxPoints} points. ${component.detail}',
                child: ExcludeSemantics(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(component.label,
                                  style: theme.textTheme.bodyMedium),
                            ),
                            Flexible(
                              child: Text(
                                '${component.points}/${component.maxPoints}',
                                style: theme.textTheme.bodySmall,
                                textAlign: TextAlign.end,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: component.ratio,
                            minHeight: 5,
                            color: fin.income,
                            backgroundColor:
                                theme.colorScheme.surfaceContainerHighest,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(component.detail,
                            style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (score.topActions.isNotEmpty) ...[
              const Divider(height: 20),
              Text('Do next', style: theme.textTheme.titleSmall),
              const SizedBox(height: 6),
              ...score.topActions.map(
                (action) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('• '),
                      Expanded(
                        child: Text(action, style: theme.textTheme.bodySmall),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ScoreGaugePainter extends CustomPainter {
  const _ScoreGaugePainter({
    required this.fraction,
    required this.color,
    required this.trackColor,
  });

  final double fraction;
  final Color color;
  final Color trackColor;

  static const _strokeWidth = 10.0;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) - _strokeWidth) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    const startAngle = -math.pi / 2;

    final track = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, 0, 2 * math.pi, false, track);

    if (fraction > 0) {
      final value = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = _strokeWidth
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, startAngle, fraction * 2 * math.pi, false, value);
    }
  }

  @override
  bool shouldRepaint(covariant _ScoreGaugePainter oldDelegate) =>
      oldDelegate.fraction != fraction ||
      oldDelegate.color != color ||
      oldDelegate.trackColor != trackColor;
}
