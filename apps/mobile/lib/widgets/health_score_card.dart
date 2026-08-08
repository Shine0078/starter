import 'package:flutter/material.dart';

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
    final scheme = Theme.of(context).colorScheme;
    return switch (score.band) {
      'excellent' || 'good' => Colors.green.shade600,
      'fair' => Colors.orange.shade700,
      _ => scheme.error,
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _bandColor(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '${score.score}',
                  style: theme.textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
                const SizedBox(width: 4),
                Text('/ 1000', style: theme.textTheme.bodySmall),
                const Spacer(),
                Chip(
                  label: Text(score.band),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...score.components.map(
              (component) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(component.label,
                            style: theme.textTheme.bodyMedium),
                        Text(
                          '${component.points}/${component.maxPoints}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: component.ratio,
                        minHeight: 5,
                        backgroundColor:
                            theme.colorScheme.surfaceContainerHighest,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(component.detail, style: theme.textTheme.bodySmall),
                  ],
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
