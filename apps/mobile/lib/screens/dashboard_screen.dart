import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';
import '../widgets/budget_tile.dart';
import '../widgets/health_score_card.dart';
import '../widgets/transaction_tile.dart';

/// The home screen: net position, health score, budgets, recent activity.
///
/// State is held with setState rather than a state-management package. At one
/// screen that is the honest choice; introducing Riverpod or Bloc here would be
/// ceremony without payoff. Revisit when there are enough screens to justify it.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({required this.api, this.onSignOut, super.key});

  final ApiClient api;

  /// Ends the session and returns to sign-in. Null in tests that render the
  /// dashboard on its own.
  final Future<void> Function()? onSignOut;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _loading = true;
  String? _error;

  List<Account> _accounts = const [];
  HealthScore? _health;
  List<BudgetProgress> _budgets = const [];
  List<Transaction> _transactions = const [];
  InsightsReport? _insights;

  @override
  void initState() {
    super.initState();
    _load(sync: true);
  }

  Future<void> _load({bool sync = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      if (sync) await widget.api.sync();

      final results = await Future.wait([
        widget.api.accounts(),
        widget.api.healthScore(),
        widget.api.budgetProgress(),
        widget.api.transactions(limit: 20),
        widget.api.insights(),
      ]);

      if (!mounted) return;
      setState(() {
        _accounts = results[0] as List<Account>;
        _health = results[1] as HealthScore;
        _budgets = results[2] as List<BudgetProgress>;
        _transactions = results[3] as List<Transaction>;
        _insights = results[4] as InsightsReport;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  /// Liquid balances minus what is owed on cards.
  String get _netPosition {
    var net = 0;
    for (final account in _accounts) {
      net += account.balanceCurrent;
    }
    // Reuse the server's formatting for a single account's currency rather than
    // reimplementing it; a mixed-currency portfolio needs real FX conversion
    // and is deliberately out of scope here.
    final sign = net < 0 ? '-' : '';
    final absolute = (net.abs() / 100).toStringAsFixed(2);
    return '$sign\$$absolute';
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your email and password to sign back in.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (confirmed == true) await widget.onSignOut?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('FINVERSE'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sync accounts',
            onPressed: _loading ? null : () => _load(sync: true),
          ),
          if (widget.onSignOut != null)
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Sign out',
              onPressed: _confirmSignOut,
            ),
        ],
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 40, color: theme.colorScheme.error),
              const SizedBox(height: 12),
              Text(
                "Couldn't reach the API",
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 6),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 6),
              Text(
                'On an Android emulator the host is 10.0.2.2, not localhost.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => _load(sync: true),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(sync: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _sectionLabel(theme, 'Net position'),
          Text(
            _netPosition,
            style: theme.textTheme.displaySmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${_accounts.length} accounts connected',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 20),

          if (_insights != null) ...[
            _sectionLabel(theme, 'This month'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    _statRow(theme, 'Income', _insights!.income),
                    _statRow(theme, 'Expenses', _insights!.expenses),
                    _statRow(theme, 'Net cash flow', _insights!.netCashFlow),
                    _statRow(theme, 'Savings rate', _insights!.savingsRate),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          if (_health != null) ...[
            _sectionLabel(theme, 'Financial health'),
            HealthScoreCard(score: _health!),
            const SizedBox(height: 20),
          ],

          if (_budgets.isNotEmpty) ...[
            _sectionLabel(theme, 'Budgets'),
            ..._budgets.map((b) => BudgetTile(progress: b)),
            const SizedBox(height: 20),
          ],

          if (_insights != null && _insights!.insights.isNotEmpty) ...[
            _sectionLabel(theme, 'Insights'),
            ..._insights!.insights.take(4).map(
                  (insight) => Card(
                    child: ListTile(
                      leading: Icon(
                        insight.severity == 'positive'
                            ? Icons.trending_down
                            : Icons.trending_up,
                        color: insight.severity == 'positive'
                            ? Colors.green
                            : theme.colorScheme.error,
                      ),
                      title: Text(insight.title),
                      subtitle: Text(
                        '${insight.detail}\nBased on ${insight.evidenceCount} transaction(s)',
                      ),
                      isThreeLine: true,
                    ),
                  ),
                ),
            const SizedBox(height: 20),
          ],

          _sectionLabel(theme, 'Recent transactions'),
          ..._transactions.map(
            (txn) => TransactionTile(
              transaction: txn,
              onRecategorize: (slug) async {
                final message = await widget.api.recategorize(txn.id, slug);
                if (!mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(message)));
                await _load();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(ThemeData theme, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 4),
        child: Text(
          text.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            letterSpacing: 1.1,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      );

  Widget _statRow(ThemeData theme, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: theme.textTheme.bodyMedium),
            Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
}
