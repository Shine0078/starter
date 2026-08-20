import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/app_lock.dart';
import '../design/design.dart';
import '../dashboard_layout.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';
import '../widgets/budget_tile.dart';
import '../widgets/health_score_card.dart';
import '../widgets/net_position_card.dart';
import '../widgets/net_worth_history_chart.dart';
import '../widgets/spending_chart.dart';
import '../widgets/transaction_tile.dart';
import '../widgets/dashboard_quick_actions.dart';
import 'bank_connections_screen.dart';
import 'notifications_screen.dart';
import 'planning_screen.dart';
import 'settings_screen.dart';
import 'subscriptions_screen.dart';
import 'transaction_detail_screen.dart';
import 'transactions_screen.dart';
import 'analytics_screen.dart';
import 'assistant_screen.dart';
import 'financial_calendar_screen.dart';

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

class _DashboardScreenState extends State<DashboardScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  String? _error;
  DateTime? _lastResumeRefresh;

  List<Account> _accounts = const [];
  List<NetWorthSnapshot> _netWorthHistory = const [];
  HealthScore? _health;
  List<BudgetProgress> _budgets = const [];
  List<Transaction> _transactions = const [];
  InsightsReport? _insights;
  DataQualityReport? _dataQuality;
  MfaStatus? _mfa;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.api.dataRevision.addListener(_onDataChanged);
    // Load persisted data immediately. Provider refreshes are explicit and
    // webhook-driven; opening the app must not inject the development mock.
    unawaited(_loadQuality());
    unawaited(_loadMfa());
    _load();
  }

  @override
  void dispose() {
    widget.api.dataRevision.removeListener(_onDataChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _onDataChanged() {
    if (!mounted || _loading) return;
    unawaited(_load());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _loading) return;
    final now = DateTime.now();
    final last = _lastResumeRefresh;
    if (last != null && now.difference(last) < const Duration(minutes: 5)) {
      return;
    }
    _lastResumeRefresh = now;
    // Resume refresh is deliberately best-effort. If the device is offline,
    // the subsequent reads still use the encrypted cache and the dashboard
    // remains useful instead of surfacing a sync error as a logout-like state.
    unawaited(_refreshAfterResume());
  }

  Future<void> _refreshAfterResume() async {
    try {
      await widget.api.replayOfflineMutations();
      await widget.api.refreshConnectedBanks();
    } catch (_) {
      // The explicit pull-to-refresh path reports failures; lifecycle refresh
      // must never interrupt the user's current screen.
    }
    unawaited(_loadQuality());
    if (mounted) await _load();
  }

  Future<void> _loadMfa() async {
    try {
      final mfa = await widget.api.mfaStatus();
      if (mounted) setState(() => _mfa = mfa);
    } catch (_) {
      if (mounted) setState(() => _mfa = null);
    }
  }

  Future<void> _loadQuality() async {
    try {
      final report = await widget.api.dataQuality();
      if (mounted) setState(() => _dataQuality = report);
    } catch (_) {
      // Data quality is advisory; a temporary outage must not hide the
      // dashboard's cached financial data.
    }
  }

  Future<void> _load({bool sync = false}) async {
    widget.api.resetOfflineStatus();
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      if (sync) {
        // A bank that needs re-authentication fails its sync with a 503, but
        // that must not blank the whole dashboard. Sync is best-effort here;
        // the Accounts screen owns the reconnect prompt.
        try {
          await widget.api.refreshConnectedBanks();
        } catch (bankSyncError) {
          debugPrint(
              'Bank sync during dashboard refresh failed: $bankSyncError');
        }
      }
      unawaited(_loadQuality());

      final accounts = await widget.api.accounts();
      final currency = _reportingCurrency(accounts);
      final results = await Future.wait([
        Future.value(accounts),
        widget.api.healthScore(currency: currency),
        widget.api.budgetProgress(),
        widget.api.transactions(limit: 20),
        widget.api.insights(currency: currency),
        widget.api.netWorthHistory(currency: currency),
      ]);

      if (!mounted) return;
      setState(() {
        _accounts = results[0] as List<Account>;
        _health = results[1] as HealthScore;
        _budgets = results[2] as List<BudgetProgress>;
        _transactions = results[3] as List<Transaction>;
        _insights = results[4] as InsightsReport;
        _netWorthHistory = results[5] as List<NetWorthSnapshot>;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  String _reportingCurrency(List<Account> accounts) {
    final currencies = accounts
        .map((account) => account.currency)
        .where((currency) => currency.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
    return currencies.isEmpty ? 'USD' : currencies.first;
  }

  Future<void> _confirmSignOut() async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.dashboardSignOutTitle),
        content: Text(l10n.dashboardSignOutDetail),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.commonSignOut),
          ),
        ],
      ),
    );

    if (confirmed == true) await widget.onSignOut?.call();
  }

  Future<void> _confirmAccountDeletion() async {
    final l10n = AppLocalizations.of(context);
    final password = TextEditingController();
    final confirmation = TextEditingController();
    final mfaCode = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.dashboardDeleteTitle),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.dashboardDeleteDetail),
              const SizedBox(height: 16),
              TextField(
                controller: password,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: l10n.dashboardDeletePasswordLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: confirmation,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: l10n.dashboardDeleteConfirmLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
              if (_mfa?.enabled == true) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: mfaCode,
                  decoration: InputDecoration(
                    labelText: l10n.loginMfaCode,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.dashboardDeleteKeepAction),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.error,
            ),
            child: Text(l10n.dashboardDeleteScheduleAction),
          ),
        ],
      ),
    );

    final passwordText = password.text;
    final confirmationText = confirmation.text;
    final mfaText = mfaCode.text.trim();
    password.dispose();
    confirmation.dispose();
    mfaCode.dispose();
    if (submitted != true || !mounted) return;

    if (passwordText.isEmpty || confirmationText != 'DELETE') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.dashboardDeleteInvalid)),
      );
      return;
    }

    try {
      await widget.api.requestAccountDeletion(
        passwordText,
        mfaCode: mfaText.isEmpty ? null : mfaText,
      );
      await widget.onAccountDeleted?.call();
    } on AuthException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.displayMessage)),
      );
    }
  }

  Future<void> _verifyEmail() async {
    final l10n = AppLocalizations.of(context);
    try {
      await widget.api.requestEmailVerification();
    } on Object catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                l10n.dashboardVerifySendFailed(friendlyErrorMessage(error)))),
      );
      return;
    }
    if (!mounted) return;

    final token = TextEditingController();
    final submitted = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.dashboardVerifyEmailTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.dashboardVerifyEmailDetail),
            const SizedBox(height: 12),
            TextField(
              controller: token,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: l10n.dashboardVerifyCodeLabel,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.dashboardVerifyLaterAction),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(token.text.trim()),
            child: Text(l10n.commonVerify),
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
        SnackBar(content: Text(l10n.dashboardVerifyEmailVerified)),
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
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('FINVERSE'),
        actions: [
          IconButton(
            icon: const Icon(Icons.show_chart),
            tooltip: l10n.profileCashFlowPlanningTitle,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => PlanningScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.calendar_month_outlined),
            tooltip: l10n.profileFinancialCalendarTitle,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => FinancialCalendarScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.insights_outlined),
            tooltip: l10n.navAnalytics,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => AnalyticsScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.auto_awesome_outlined),
            tooltip: l10n.assistantTitle,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => AssistantScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.subscriptions_outlined),
            tooltip: l10n.profileSubscriptionsTitle,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => SubscriptionsScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            tooltip: l10n.notificationsTitle,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => NotificationsScreen(api: widget.api),
            )),
          ),
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: l10n.dashboardSyncTooltip,
            onPressed: _loading ? null : () => _load(sync: true),
          ),
          if (widget.onSignOut != null)
            PopupMenuButton<String>(
              tooltip: l10n.dashboardAccountMenuTooltip,
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
                PopupMenuItem(
                  value: 'settings',
                  child: ListTile(
                    leading: const Icon(Icons.settings_outlined),
                    title: Text(l10n.profileSettingsPrivacyTitle),
                  ),
                ),
                PopupMenuItem(
                  value: 'sign-out',
                  child: ListTile(
                    leading: const Icon(Icons.logout),
                    title: Text(l10n.commonSignOut),
                  ),
                ),
                PopupMenuItem(
                  value: 'verify-email',
                  child: ListTile(
                    leading: const Icon(Icons.mark_email_read_outlined),
                    title: Text(l10n.dashboardVerifyEmailMenu),
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
                      title: Text(l10n.dashboardDeleteAccountMenu),
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
    final l10n = AppLocalizations.of(context);
    // A skeleton in the shape of the real dashboard, not a spinner in the
    // middle of a blank screen (§33). Nothing jumps when the data lands.
    if (_loading) return const FinDashboardSkeleton();

    if (_error != null) {
      return SingleChildScrollView(
        child: FinErrorState(
          title: "We couldn't load your finances",
          // Plain language, and something to do about it (§34). The raw
          // exception is still available, one tap down, for whoever needs it.
          message: 'FINVERSE could not reach its server. Check your connection '
              'and try again — nothing has been lost.',
          onRetry: () => _load(sync: true),
          technicalDetail: _error,
        ),
      );
    }

    final hero = NetPositionCard(accounts: _accounts);
    final quickActions = DashboardQuickActions(
      hasAccounts: _accounts.isNotEmpty,
      onAccounts: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => BankConnectionsScreen(api: widget.api),
      )),
      onTransactions: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => TransactionsScreen(api: widget.api),
      )),
      onPlanning: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => PlanningScreen(api: widget.api),
      )),
      onAnalytics: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => AnalyticsScreen(api: widget.api),
      )),
    );
    final dataQuality = (_dataQuality?.needsAttention == true)
        ? _dataQualityCard(theme, _dataQuality!)
        : null;
    final sections = _sections(theme, l10n);

    return RefreshIndicator(
      onRefresh: () => _load(sync: true),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Phones stay a single column; tablets and landscape split the
          // sections into two, so more of the month is visible without
          // scrolling past a wall of cards.
          final wide = constraints.maxWidth >= 900;
          if (!wide) {
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                hero,
                const SizedBox(height: 20),
                quickActions,
                const SizedBox(height: 20),
                if (dataQuality != null) ...[
                  dataQuality,
                  const SizedBox(height: 20),
                ],
                ..._spaced(sections),
              ],
            );
          }

          final left = <Widget>[];
          final right = <Widget>[];
          for (var i = 0; i < sections.length; i++) {
            (i.isEven ? left : right).add(sections[i]);
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1080),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      hero,
                      const SizedBox(height: 20),
                      quickActions,
                      const SizedBox(height: 20),
                      if (dataQuality != null) ...[
                        dataQuality,
                        const SizedBox(height: 20),
                      ],
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: Column(children: _spaced(left))),
                          const SizedBox(width: 16),
                          Expanded(child: Column(children: _spaced(right))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// The dashboard sections below the hero, in display order. Kept as a flat
  /// list of self-contained columns so the narrow and wide layouts can consume
  /// the same content without duplicating it.
  List<Widget> _sections(ThemeData theme, AppLocalizations l10n) => [
        if (_visible(DashboardCard.netWorth) && _netWorthHistory.isNotEmpty)
          NetWorthHistoryChart(points: _netWorthHistory),
        if (_visible(DashboardCard.monthlySummary) && _insights != null)
          _insightsSection(theme, l10n),
        if (_visible(DashboardCard.spending) &&
            _insights != null &&
            _insights!.topCategories.isNotEmpty)
          SpendingChart(categories: _insights!.topCategories),
        if (_visible(DashboardCard.health) && _health != null)
          _healthSection(theme, l10n),
        if (_visible(DashboardCard.budgets) && _budgets.isNotEmpty)
          _budgetsSection(theme, l10n),
        if (_visible(DashboardCard.insights) &&
            _insights != null &&
            _insights!.insights.isNotEmpty)
          _insightsListSection(theme, l10n),
        if (_visible(DashboardCard.transactions))
          _transactionsSection(theme, l10n),
      ];

  bool _visible(DashboardCard card) {
    return DashboardLayoutControllerScope.maybeOf(context)?.isVisible(card) ??
        true;
  }

  List<Widget> _spaced(List<Widget> items) {
    final result = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) result.add(const SizedBox(height: 20));
      result.add(items[i]);
    }
    return result;
  }

  Widget _insightsSection(ThemeData theme, AppLocalizations l10n) {
    final insights = _insights!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(theme, l10n.analyticsThisMonth),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final tileWidth = (constraints.maxWidth - 12) / 2;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    SizedBox(
                      width: tileWidth,
                      child: FinSummaryTile(
                        label: l10n.analyticsIncome,
                        value: insights.income,
                        icon: Icons.south_west,
                        accent: context.finColors.income,
                      ),
                    ),
                    SizedBox(
                      width: tileWidth,
                      child: FinSummaryTile(
                        label: l10n.analyticsNetExpenses,
                        value: insights.expenses,
                        icon: Icons.north_east,
                        accent: context.finColors.expense,
                      ),
                    ),
                    SizedBox(
                      width: tileWidth,
                      child: FinSummaryTile(
                        label: l10n.dashboardNetCashFlow,
                        value: insights.netCashFlow,
                        icon: Icons.swap_vert,
                        accent: context.finColors.positiveTrend,
                      ),
                    ),
                    SizedBox(
                      width: tileWidth,
                      child: FinSummaryTile(
                        label: l10n.analyticsSavingsRate,
                        value: insights.savingsRate,
                        icon: Icons.savings_outlined,
                        accent: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
        if (insights.comparison?.hasAny == true) ...[
          const SizedBox(height: 8),
          _comparisonCard(theme, insights.comparison!),
        ],
      ],
    );
  }

  Widget _healthSection(ThemeData theme, AppLocalizations l10n) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(theme, l10n.dashboardFinancialHealth),
          HealthScoreCard(score: _health!),
        ],
      );

  Widget _budgetsSection(ThemeData theme, AppLocalizations l10n) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(theme, l10n.budgetsTitle),
          ..._budgets.map((b) => BudgetTile(progress: b)),
        ],
      );

  Widget _insightsListSection(ThemeData theme, AppLocalizations l10n) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(theme, l10n.dashboardInsights),
          ..._insights!.insights.take(4).map(
                (insight) => Card(
                  child: ListTile(
                    leading: Icon(
                      insight.severity == 'positive'
                          ? Icons.trending_down
                          : Icons.trending_up,
                      color: insight.severity == 'positive'
                          ? context.finColors.income
                          : theme.colorScheme.error,
                    ),
                    title: Text(insight.title),
                    trailing: _priorityChip(theme, insight.priority),
                    subtitle: Text(
                      '${insight.detail}\nBased on ${insight.evidenceCount} transaction(s)',
                    ),
                    isThreeLine: true,
                  ),
                ),
              ),
        ],
      );

  Widget _transactionsSection(ThemeData theme, AppLocalizations l10n) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(theme, l10n.dashboardRecentTransactions),
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
      );

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

  Widget _comparisonCard(ThemeData theme, InsightsComparison comparison) =>
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(AppLocalizations.of(context).dashboardComparedWithPeriod,
                  style: theme.textTheme.titleSmall),
              const SizedBox(height: 6),
              for (final entry in [
                ('Income', comparison.income),
                ('Expenses', comparison.expenses),
                ('Net cash flow', comparison.netCashFlow),
                ('Savings rate', comparison.savingsRate),
              ])
                if (entry.$2 != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(entry.$1),
                        Flexible(
                          child: Text(entry.$2!, textAlign: TextAlign.end),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      );

  Widget _dataQualityCard(ThemeData theme, DataQualityReport report) => Card(
        color: theme.colorScheme.errorContainer,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.fact_check_outlined,
                      color: theme.colorScheme.onErrorContainer),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Some financial data needs attention',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Text('${report.score}/100',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.onErrorContainer,
                      )),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Analytics remain available, but these checks show where the source data may be incomplete.',
                style: TextStyle(color: theme.colorScheme.onErrorContainer),
              ),
              const SizedBox(height: 10),
              ...report.issues.take(3).map(
                    (issue) => Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('• ${issue.title}: ${issue.message}',
                          style: TextStyle(
                              color: theme.colorScheme.onErrorContainer)),
                    ),
                  ),
            ],
          ),
        ),
      );

  Widget _priorityChip(ThemeData theme, String priority) {
    final (label, color) = switch (priority) {
      'critical' => ('Critical', theme.colorScheme.error),
      'important' => ('Important', theme.colorScheme.tertiary),
      _ => ('Info', theme.colorScheme.outline),
    };
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: color.withValues(alpha: 0.35)),
      labelStyle: TextStyle(color: color, fontSize: 11),
    );
  }
}
