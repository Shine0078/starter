/// Empty, error and stale states (MISSION2 §34, §35, §33).
///
/// The five situations a finance screen must be able to tell apart, because
/// they need different words and different actions from the user:
///
///   no data · a real zero · nothing connected · syncing · sync failed
///
/// Collapsing them is how "we could not reach your bank" ends up looking
/// identical to "you have not spent anything", which is the difference between
/// a calm user and a worried one.
library;

import 'package:flutter/material.dart';

import '../colors.dart';
import '../tokens.dart';

/// Nothing here yet, with a way forward.
///
/// [action] is not optional decoration: §35 requires every empty state to say
/// what to do next. An empty screen with no exit is a dead end.
class FinEmptyState extends StatelessWidget {
  const FinEmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: FinSpace.xl,
        vertical: FinSpace.huge,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Decorative: the title and message already carry the meaning, so a
          // screen reader announcing "inbox icon" would only add noise.
          Icon(icon, size: 44, color: theme.colorScheme.outline),
          const SizedBox(height: FinSpace.lg),
          Text(
            title,
            style: theme.textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: FinSpace.sm),
          Text(
            message,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: FinSpace.xl),
            FilledButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

/// Something failed, said in words the user can act on.
///
/// §34 is explicit: never `HTTP 500`, never `ProviderError
/// INVALID_ACCESS_TOKEN`. [technicalDetail] is accepted but shown only behind a
/// disclosure, so a developer can still get at it without it being the first
/// thing a worried person reads.
class FinErrorState extends StatelessWidget {
  const FinErrorState({
    required this.title,
    required this.message,
    this.onRetry,
    this.retryLabel = 'Try again',
    this.technicalDetail,
    super.key,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;
  final String retryLabel;
  final String? technicalDetail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;

    return Padding(
      padding: const EdgeInsets.all(FinSpace.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_outlined, size: 44, color: fin.warning),
          const SizedBox(height: FinSpace.lg),
          Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: FinSpace.sm),
          Text(
            message,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          if (onRetry != null) ...[
            const SizedBox(height: FinSpace.xl),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(retryLabel),
            ),
          ],
          if (technicalDetail != null && technicalDetail!.isNotEmpty) ...[
            const SizedBox(height: FinSpace.md),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text('Technical details', style: theme.textTheme.bodySmall),
              children: [
                SelectableText(
                  technicalDetail!,
                  style: theme.textTheme.bodySmall?.copyWith(color: fin.neutral),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// "You are looking at saved data" (§33).
///
/// Non-blocking on purpose: stale figures are still useful, and hiding them
/// behind a spinner while the network struggles helps nobody. It says when the
/// data is from so the user can judge it themselves.
class FinStaleBanner extends StatelessWidget {
  const FinStaleBanner({required this.message, this.onRefresh, super.key});

  final String message;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final fin = context.finColors;
    final theme = Theme.of(context);

    return Material(
      color: fin.warningContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: FinSpace.lg,
          vertical: FinSpace.md,
        ),
        child: Row(
          children: [
            Icon(Icons.cloud_off_outlined, size: 18, color: fin.onWarningContainer),
            const SizedBox(width: FinSpace.md),
            Expanded(
              child: Text(
                message,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: fin.onWarningContainer,
                ),
              ),
            ),
            if (onRefresh != null)
              TextButton(
                onPressed: onRefresh,
                child: const Text('Refresh'),
              ),
          ],
        ),
      ),
    );
  }
}

/// A quiet "working on it" for a refresh that is not blocking the screen.
class FinSyncingChip extends StatelessWidget {
  const FinSyncingChip({this.label = 'Updating your latest transactions…', super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      liveRegion: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: FinSpace.sm),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
