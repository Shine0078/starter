import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
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
    final l10n = AppLocalizations.of(context);
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
              '${transaction.postedAt} · ${_categoryLabel(l10n, transaction.categorySlug)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall,
            ),
          ),
          if (transaction.pending) ...[
            const SizedBox(width: 6),
            _badge(theme, l10n.transactionTilePending),
          ],
          if (transaction.needsReview) ...[
            const SizedBox(width: 6),
            _badge(theme, l10n.transactionTileReview, emphasis: true),
          ],
          if (transaction.excludedFromAnalytics) ...[
            const SizedBox(width: 6),
            _badge(theme, l10n.transactionTileExcluded),
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
            tooltip: l10n.transactionTileChangeCategory,
            onSelected: onRecategorize,
            itemBuilder: (context) => _quickCategories
                .map(
                  (slug) => PopupMenuItem<String>(
                    value: slug,
                    child: Text(_categoryLabel(l10n, slug)),
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

  String _categoryLabel(AppLocalizations l10n, String slug) => switch (slug) {
        'groceries' => l10n.transactionCategoryGroceries,
        'restaurants' => l10n.transactionCategoryRestaurants,
        'coffee' => l10n.transactionCategoryCoffee,
        'food_delivery' => l10n.transactionCategoryFoodDelivery,
        'fuel' => l10n.transactionCategoryFuel,
        'rideshare' => l10n.transactionCategoryRideshare,
        'shopping' => l10n.transactionCategoryShopping,
        'rent' => l10n.transactionCategoryRent,
        'utilities' => l10n.transactionCategoryUtilities,
        'streaming' => l10n.transactionCategoryStreaming,
        'fitness' => l10n.transactionCategoryFitness,
        'healthcare' => l10n.transactionCategoryHealthcare,
        _ => slug.replaceAll('_', ' '),
      };
}
