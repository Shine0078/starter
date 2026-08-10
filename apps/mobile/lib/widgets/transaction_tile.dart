import 'package:flutter/material.dart';

import '../models/models.dart';

/// One transaction row, with the correction affordance.
///
/// Correcting a category is the single highest-leverage interaction in the
/// product: it fixes the row, teaches the categorizer, and backfills every past
/// transaction from the same merchant. It should never be more than one tap away.
class TransactionTile extends StatelessWidget {
  const TransactionTile({
    required this.transaction,
    required this.onRecategorize,
    this.onTap,
    super.key,
  });

  final Transaction transaction;
  final Future<void> Function(String categorySlug) onRecategorize;
  final VoidCallback? onTap;

  static const _quickCategories = <String>[
    'groceries',
    'restaurants',
    'coffee',
    'food_delivery',
    'fuel',
    'rideshare',
    'shopping',
    'rent',
    'utilities',
    'streaming',
    'fitness',
    'healthcare',
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isOutflow = transaction.amount < 0;

    return ListTile(
      onTap: onTap,
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(
        transaction.displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Row(
        children: [
          Flexible(
            child: Text(
              '${transaction.postedAt} · ${transaction.categorySlug}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall,
            ),
          ),
          if (transaction.pending) ...[
            const SizedBox(width: 6),
            _badge(theme, 'pending'),
          ],
          if (transaction.needsReview) ...[
            const SizedBox(width: 6),
            _badge(theme, 'review', emphasis: true),
          ],
          if (transaction.excludedFromAnalytics) ...[
            const SizedBox(width: 6),
            _badge(theme, 'excluded'),
          ],
          if (transaction.isRecurring) ...[
            const SizedBox(width: 6),
            Icon(Icons.autorenew, size: 12, color: theme.colorScheme.outline),
          ],
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            transaction.amountFormatted,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: isOutflow ? null : Colors.green.shade600,
            ),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, size: 18),
            tooltip: 'Change category',
            onSelected: onRecategorize,
            itemBuilder: (context) => _quickCategories
                .map(
                  (slug) => PopupMenuItem<String>(
                    value: slug,
                    child: Text(slug.replaceAll('_', ' ')),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _badge(ThemeData theme, String label, {bool emphasis = false}) {
    final color =
        emphasis ? theme.colorScheme.error : theme.colorScheme.outline;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(color: color, fontSize: 10),
      ),
    );
  }
}
