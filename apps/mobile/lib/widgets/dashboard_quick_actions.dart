import 'package:flutter/material.dart';

import '../design/design.dart';

/// A small action center for the dashboard.
///
/// Finance dashboards are often good at reporting yesterday and bad at
/// helping a person decide what to do next. These actions intentionally route
/// into existing flows rather than creating a second version of account or
/// planning logic. The empty-account copy also gives a new user a clear first
/// step without inventing sample balances.
class DashboardQuickActions extends StatelessWidget {
  const DashboardQuickActions({
    required this.hasAccounts,
    required this.onAccounts,
    required this.onTransactions,
    required this.onPlanning,
    required this.onAnalytics,
    super.key,
  });

  final bool hasAccounts;
  final VoidCallback onAccounts;
  final VoidCallback onTransactions;
  final VoidCallback onPlanning;
  final VoidCallback onAnalytics;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final actions = [
      _Action(
        icon: Icons.account_balance_outlined,
        label: hasAccounts ? 'Manage accounts' : 'Connect an account',
        onPressed: onAccounts,
      ),
      _Action(
        icon: Icons.receipt_long_outlined,
        label: 'Review transactions',
        onPressed: onTransactions,
      ),
      _Action(
        icon: Icons.event_available_outlined,
        label: 'Plan cash flow',
        onPressed: onPlanning,
      ),
      _Action(
        icon: Icons.insights_outlined,
        label: 'Explore reports',
        onPressed: onAnalytics,
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(FinSpace.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              hasAccounts
                  ? 'Keep your plan moving'
                  : 'Start with one clear step',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: FinSpace.xs),
            Text(
              hasAccounts
                  ? 'Jump straight to the part of your finances you want to work on.'
                  : 'Connect a bank or add a manual account to unlock your dashboard.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: FinSpace.md),
            Semantics(
              container: true,
              label: 'Dashboard quick actions',
              child: Wrap(
                spacing: FinSpace.sm,
                runSpacing: FinSpace.sm,
                children: [
                  for (final action in actions)
                    ActionChip(
                      avatar: Icon(action.icon, size: 18),
                      label: Text(action.label),
                      onPressed: action.onPressed,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Action {
  const _Action({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;
}
