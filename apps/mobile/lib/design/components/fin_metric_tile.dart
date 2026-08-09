/// A single financial figure with its label and, optionally, how it compares.
///
/// The unit the dashboard is built from (MISSION2 §4, §5). A number on its own
/// answers "how much"; the comparison answers "is that good", which is the
/// question people actually open the app with.
library;

import 'package:flutter/material.dart';

import '../colors.dart';
import '../tokens.dart';
import '../typography.dart';
import 'money_text.dart';

/// Which way a change should be read.
///
/// Separate from the sign because the two disagree constantly: spending £200
/// *less* is a negative change and good news, while earning £200 less is a
/// negative change and bad news. Only the caller knows which.
enum TrendMeaning { higherIsBetter, lowerIsBetter, neutral }

class FinMetricTile extends StatelessWidget {
  const FinMetricTile({
    required this.label,
    required this.formatted,
    required this.amountMinor,
    this.tone = MoneyTone.neutral,
    this.comparison,
    this.comparisonAmountMinor,
    this.trendMeaning = TrendMeaning.neutral,
    this.icon,
    this.onTap,
    super.key,
  });

  final String label;
  final String formatted;
  final int amountMinor;
  final MoneyTone tone;

  /// Plain-language comparison, e.g. "£120 more than last month" (§32).
  final String? comparison;

  /// The change itself, for choosing the arrow and colour.
  final int? comparisonAmountMinor;

  final TrendMeaning trendMeaning;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;

    final change = comparisonAmountMinor;
    final isGood = switch (trendMeaning) {
      TrendMeaning.neutral => null,
      TrendMeaning.higherIsBetter => change == null ? null : change >= 0,
      TrendMeaning.lowerIsBetter => change == null ? null : change <= 0,
    };

    final trendColor = isGood == null
        ? theme.colorScheme.onSurfaceVariant
        : (isGood ? fin.positiveTrend : fin.negativeTrend);

    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(FinSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: FinSpace.sm),
                  ],
                  Expanded(
                    child: Text(
                      label,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: FinSpace.sm),
              MoneyText(
                formatted: formatted,
                amountMinor: amountMinor,
                emphasis: MoneyEmphasis.large,
                tone: tone,
                showSign: tone != MoneyTone.neutral,
                semanticsPrefix: label,
              ),
              if (comparison != null) ...[
                const SizedBox(height: FinSpace.xs),
                Row(
                  children: [
                    if (change != null && change != 0)
                      // An arrow as well as a colour: direction must survive
                      // greyscale and colour blindness (§41).
                      Icon(
                        change > 0 ? Icons.arrow_upward : Icons.arrow_downward,
                        size: 13,
                        color: trendColor,
                      ),
                    Flexible(
                      child: Text(
                        comparison!,
                        style: FinType.moneySmall.copyWith(color: trendColor),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A quiet heading above a group of cards.
class FinSectionHeader extends StatelessWidget {
  const FinSectionHeader({required this.title, this.action, super.key});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(FinSpace.xs, FinSpace.xxl, FinSpace.xs, FinSpace.md),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title.toUpperCase(),
                style: FinType.sectionLabel.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}
