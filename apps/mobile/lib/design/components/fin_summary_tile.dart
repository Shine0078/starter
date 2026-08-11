import 'package:flutter/material.dart';

import '../tokens.dart';

/// A compact, readable summary value for overview screens.
///
/// Unlike [FinMetricTile], this component accepts an API-formatted value
/// without asking the client to parse money. That keeps currency/exponent
/// decisions server-authoritative while giving the dashboard a consistent
/// visual hierarchy.
class FinSummaryTile extends StatelessWidget {
  const FinSummaryTile({
    required this.label,
    required this.value,
    this.icon,
    this.supporting,
    this.accent,
    super.key,
  });

  final String label;
  final String value;
  final IconData? icon;
  final String? supporting;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = accent ?? theme.colorScheme.primary;
    return Semantics(
      container: true,
      label: '$label: $value${supporting == null ? '' : ', $supporting'}',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color:
              theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.42),
          borderRadius: FinRadius.cardBorder,
          border: Border.all(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.55),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(FinSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 17, color: color),
                    const SizedBox(width: FinSpace.sm),
                  ],
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: FinSpace.sm),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  maxLines: 1,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
              if (supporting != null) ...[
                const SizedBox(height: FinSpace.xs),
                Text(
                  supporting!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
