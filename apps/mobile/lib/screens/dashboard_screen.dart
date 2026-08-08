import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/app_lock.dart';
import '../models/models.dart';
import '../widgets/budget_tile.dart';
import '../widgets/health_score_card.dart';
import '../widgets/net_position_card.dart';
import '../widgets/spending_chart.dart';
import '../widgets/transaction_tile.dart';
import 'notifications_screen.dart';
import 'settings_screen.dart';
import 'subscriptions_screen.dart';
import 'transaction_detail_screen.dart';

/// The home screen: net position, health score, budgets, recent activity.
///
/// State is held with setState rather than a state-management package. At one
/// screen that is the honest choice; introducing Riverpod or Bloc here would be
/// ceremony without payoff. Revisit when there are enough screens to justify it.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    required this.api,
    this.onSignOut,
    this.onAccountDeleted,
    this.appLockController,
    super.key,
  });

  final ApiClient api;

  /// Ends the session and returns to sign-in. Null in tests that render the
  /// dashboard on its own.
  final Future<void> Function()? onSignOut;
  final Future<void> Function()? onAccountDeleted;
  final AppLockController? appLockController;

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
    // Load persisted data immediately. Provider refreshes are explicit and
    // webhook-driven; opening the app must not inject the development mock.
    _load();
  }

  Future<void> _load({bool sync = false}) async {
    widget.api.resetOfflineStatus();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      if (sync) await widget.api.refreshConnectedBanks();

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

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
            'You will need your email and password to sign back in.'),
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

  Future<void> _confirmAccountDeletion() async {
    final password = TextEditingController();
    final confirmation = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete your account?'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Access ends immediately. You have 30 days to restore the account; '
                'after that, your profile and finance data are permanently erased.',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Current password',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirmation,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Type DELETE to confirm',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep account'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.error,
            ),
            child: const Text('Schedule deletion'),
          ),
        ],
      ),
    );

    final passwordText = password.text;
    final confirmationText = confirmation.text;
    password.dispose();
    confirmation.dispose();
    if (submitted != true || !mounted) return;

    if (passwordText.isEmpty || confirmationText != 'DELETE') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Enter your password and type DELETE exactly.')),
      );
      return;
    }

    try {
      await widget.api.requestAccountDeletion(passwordText);
      await widget.onAccountDeleted?.call();
    } on AuthException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.displayMessage)),
      );
    }
  }

  Future<void> _verifyEmail() async {
    try {
      await widget.api.requestEmailVerification();
    } on Object catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not send verification: $error')),
      );
      return;
    }
    if (!mounted) return;

    final token = TextEditingController();
    final submitted = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Verify your email'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'Enter the 24-hour verification code sent to your email.'),
            const SizedBox(height: 12),
            TextField(
              controller: token,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Verification code',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Later'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(token.text.trim()),
            child: const Text('Verify'),
          ),
        ],
      ),
    );
    token.dispose();
    if (submitted == null || submitted.isEmpty || !mounted) return;

    try {
      await widget.api.confirmEmailVerification(submitted);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email verified.')),
      );
    } on AuthException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.displayMessage)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('FINVERSE'),
        actions: [
          IconButton(
            icon: const Icon(Icons.subscriptions_outlined),
            tooltip: 'Subscriptions',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => SubscriptionsScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            tooltip: 'Notifications',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => NotificationsScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sync accounts',
            onPressed: _loading ? null : () => _load(sync: true),
          ),
          if (widget.onSignOut != null)
            PopupMenuButton<String>(
              tooltip: 'Account menu',
              onSelected: (value) {
                if (value == 'settings') {
                  Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => SettingsScreen(
                      api: widget.api,
                      appLockController: widget.appLockController,
                      onVerifyEmail: _verifyEmail,
                      onSignOut: _confirmSignOut,
                      onDeleteAccount: _confirmAccountDeletion,
                      onSignedOutEverywhere: () async {
                        if (mounted) Navigator.of(context).pop();
                        await widget.onSignOut?.call();
                      },
                    ),
                  ));
                }
                if (value == 'sign-out') _confirmSignOut();
                if (value == 'verify-email') _verifyEmail();
                if (value == 'delete-account') _confirmAccountDeletion();
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: 'settings',
                  child: ListTile(
                    leading: Icon(Icons.settings_outlined),
                    title: Text('Settings & privacy'),
                  ),
                ),
                const PopupMenuItem(
                  value: 'sign-out',
                  child: ListTile(
                    leading: Icon(Icons.logout),
                    title: Text('Sign out'),
                  ),
                ),
                const PopupMenuItem(
                  value: 'verify-email',
                  child: ListTile(
                    leading: Icon(Icons.mark_email_read_outlined),
                    title: Text('Verify email'),
                  ),
                ),
                if (widget.onAccountDeleted != null)
                  PopupMenuItem(
                    value: 'delete-account',
                    child: ListTile(
                      leading: Icon(
                        Icons.delete_forever,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      title: const Text('Delete account'),
                    ),
                  ),
              ],
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
          NetPositionCard(accounts: _accounts),
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
            if (_insights!.topCategories.isNotEmpty) ...[
              SpendingChart(categories: _insights!.topCategories),
              const SizedBox(height: 20),
            ],
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
              onTap: () async {
                await Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => TransactionDetailScreen(
                    api: widget.api,
                    transaction: txn,
                  ),
                ));
                await _load();
              },
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
