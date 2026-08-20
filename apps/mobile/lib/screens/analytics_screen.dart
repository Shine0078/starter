import 'package:flutter/material.dart';

import '../api/client.dart';
import '../design/design.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';
import '../widgets/health_score_card.dart';
import '../widgets/spending_chart.dart';
import '../widgets/trend_chart.dart';
import '../widgets/spending_heatmap.dart';
import 'planning_screen.dart';

/// A dedicated, explainable analytics view. The dashboard stays a quick
/// overview; this screen gives the user the evidence behind the numbers and a
/// direct path to the forecast simulator.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  AnalyticsReport? _analytics;
  InsightsReport? _insights;
  HealthScore? _health;
  SubscriptionsReport? _subscriptions;
  bool _loading = true;
  String? _error;
  String _period = 'month';
  String _currency = 'USD';
  DateTime? _customFrom;
  DateTime? _customTo;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    widget.api.dataRevision.addListener(_onDataChanged);
    _load();
  }

  @override
  void dispose() {
    widget.api.dataRevision.removeListener(_onDataChanged);
    super.dispose();
  }

  void _onDataChanged() {
    if (!mounted || _loading) return;
    _load();
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    widget.api.resetOfflineStatus();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final accounts = await widget.api.accounts();
      final currencies = accounts
          .map((account) => account.currency)
          .where((currency) => currency.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      if (currencies.isNotEmpty) _currency = currencies.first;
      final results = await Future.wait([
        widget.api.analytics(
          period: _period,
          currency: _currency,
          from: _period == 'custom' ? _customFrom : null,
          to: _period == 'custom' ? _customTo : null,
        ),
        widget.api.insights(currency: _currency),
        widget.api.healthScore(currency: _currency),
        widget.api.subscriptions(currency: _currency),
      ]);
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _analytics = results[0] as AnalyticsReport;
        _insights = results[1] as InsightsReport;
        _health = results[2] as HealthScore;
        _subscriptions = results[3] as SubscriptionsReport;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  Future<void> _changePeriod(String? value) async {
    if (value == null || value == _period) return;
    if (value == 'custom') {
      final now = DateTime.now();
      final start = await showDatePicker(
        context: context,
        firstDate: DateTime(2000),
        lastDate: now,
        initialDate: _customFrom ?? DateTime(now.year, now.month, 1),
        helpText: AppLocalizations.of(context).analyticsChooseFirstDay,
      );
      if (!mounted || start == null) return;
      final end = await showDatePicker(
        context: context,
        firstDate: start,
        lastDate: now,
        initialDate: _customTo ?? now,
        helpText: AppLocalizations.of(context).analyticsChooseLastDay,
      );
      if (!mounted || end == null) return;
      setState(() {
        _period = value;
        _customFrom = start;
        _customTo = end;
      });
    } else {
      setState(() => _period = value);
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navAnalytics),
        actions: [
          IconButton(
            tooltip: l10n.analyticsRefreshTooltip,
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    if (_loading) return const FinDashboardSkeleton();
    if (_error != null) {
      return SingleChildScrollView(
        child: FinErrorState(
          title: AppLocalizations.of(context).analyticsUnavailable,
          message: AppLocalizations.of(context).analyticsUnavailableDetail,
          onRetry: _load,
          technicalDetail: _error,
        ),
      );
    }

    final analytics = _analytics!;
    final insights = _insights!;
    final categories = analytics.spendingByCategory
        .map((row) => CategorySpend(
              categorySlug: row.key,
              categoryName: row.label,
              total: row.total,
              totalFormatted: row.totalFormatted,
              transactionCount: row.transactionCount,
            ))
        .toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(_periodLabel(_period),
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _period,
            decoration: InputDecoration(
                labelText: AppLocalizations.of(context).analyticsPeriodLabel),
            items: [
              DropdownMenuItem(
                  value: 'week',
                  child: Text(AppLocalizations.of(context).analyticsThisWeek)),
              DropdownMenuItem(
                  value: 'month',
                  child: Text(AppLocalizations.of(context).analyticsThisMonth)),
              DropdownMenuItem(
                  value: '3m',
                  child: Text(
                      AppLocalizations.of(context).analyticsLastThreeMonths)),
              DropdownMenuItem(
                  value: '6m',
                  child: Text(
                      AppLocalizations.of(context).analyticsLastSixMonths)),
              DropdownMenuItem(
                  value: 'year',
                  child: Text(AppLocalizations.of(context).analyticsLastYear)),
              DropdownMenuItem(
                  value: 'lifetime',
                  child:
                      Text(AppLocalizations.of(context).analyticsAllHistory)),
              DropdownMenuItem(
                  value: 'custom',
                  child:
                      Text(AppLocalizations.of(context).analyticsCustomRange)),
            ],
            onChanged: (value) => _changePeriod(value),
          ),
          const SizedBox(height: 12),
          Text(
            '${analytics.periodStart} to ${analytics.periodEnd}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          _metricGrid(context, analytics),
          const SizedBox(height: 20),
          if (analytics.trend.isNotEmpty) ...[
            TrendChart(points: analytics.trend),
            const SizedBox(height: 20),
            SpendingHeatmap(points: analytics.trend),
            const SizedBox(height: 20),
          ],
          if (categories.isNotEmpty) ...[
            SpendingChart(categories: categories),
            const SizedBox(height: 20),
          ] else
            FinEmptyState(
              icon: Icons.insights_outlined,
              title: AppLocalizations.of(context).analyticsHistoryEmptyTitle,
              message: AppLocalizations.of(context).analyticsHistoryEmptyDetail,
            ),
          _velocityCard(context, analytics.velocity),
          if (analytics.refundMatches.isNotEmpty) ...[
            const SizedBox(height: 20),
            _refundCard(context, analytics.refundMatches),
          ],
          if (_health != null) ...[
            const SizedBox(height: 4),
            HealthScoreCard(score: _health!),
            const SizedBox(height: 20),
          ],
          if (_subscriptions != null) _subscriptionCard(context),
          if (insights.insights.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(AppLocalizations.of(context).analyticsExplainableInsights,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...insights.insights.map((insight) => Card(
                  child: ListTile(
                    leading: Icon(
                      insight.severity == 'positive'
                          ? Icons.trending_down
                          : Icons.info_outline,
                      color: insight.severity == 'positive'
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.tertiary,
                    ),
                    title: Text(insight.title),
                    trailing:
                        _priorityChip(Theme.of(context), insight.priority),
                    subtitle: Text(
                      '${insight.detail}\n${AppLocalizations.of(context).analyticsEvidenceCount(insight.evidenceCount)}',
                    ),
                    isThreeLine: true,
                  ),
                )),
          ],
          if (analytics.timeline.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(AppLocalizations.of(context).analyticsTimeline,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: analytics.timeline
                    .take(8)
                    .map((event) => ListTile(
                          dense: true,
                          leading: Icon(_timelineIcon(event.kind)),
                          title: Text(event.label),
                          subtitle:
                              Text('${event.date} · ${_timelineKind(event.kind)}'),
                          trailing: Text(event.amountFormatted),
                        ))
                    .toList(),
              ),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => PlanningScreen(api: widget.api),
            )),
            icon: const Icon(Icons.show_chart),
            label: Text(AppLocalizations.of(context).analyticsPlanAction),
          ),
        ],
      ),
    );
  }

  Widget _metricGrid(BuildContext context, AnalyticsReport analytics) {
    final l10n = AppLocalizations.of(context);
    final values = [
      (l10n.analyticsIncome, analytics.totalIncomeFormatted),
      (l10n.analyticsNetExpenses, analytics.netExpensesFormatted),
      (l10n.analyticsSavings, analytics.savingsFormatted),
      (
        l10n.analyticsSavingsRate,
        '${analytics.savingsRate.toStringAsFixed(1)}%'
      ),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.75,
      children: values
          .map((entry) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(entry.$1,
                          style: Theme.of(context).textTheme.labelMedium),
                      const SizedBox(height: 6),
                      Text(entry.$2,
                          style: Theme.of(context).textTheme.titleMedium),
                    ],
                  ),
                ),
              ))
          .toList(),
    );
  }

  Widget _velocityCard(BuildContext context, AnalyticsVelocity velocity) {
    final l10n = AppLocalizations.of(context);
    final detail = !velocity.enoughHistory
        ? l10n.analyticsPaceNoHistory
        : velocity.percentDelta == null
            ? l10n.analyticsPaceNoComparison
            : l10n.analyticsPaceProjected(
                velocity.percentDelta!.abs().toStringAsFixed(1),
                velocity.percentDelta! >= 0
                    ? l10n.analyticsPaceAbove
                    : l10n.analyticsPaceBelow,
              );
    return Card(
      child: ListTile(
        leading: const Icon(Icons.speed),
        title: Text(
            l10n.analyticsPaceTitle(velocity.projectedPeriodSpendFormatted)),
        subtitle: Text(
            '$detail\n${l10n.analyticsPaceCurrent(velocity.currentPeriodSpendFormatted)}'),
        isThreeLine: true,
      ),
    );
  }

  Widget _refundCard(BuildContext context, List<AnalyticsRefundMatch> matches) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(AppLocalizations.of(context).analyticsRefundsMatched,
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              AppLocalizations.of(context).analyticsRefundsDetail,
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            for (final match in matches.take(4))
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: const Icon(Icons.undo_outlined),
                title: Text(match.merchant),
                subtitle: Text(
                  '${match.amountFormatted} refunded · ${match.daysAfterPurchase} days after purchase',
                ),
                trailing: Text(match.purchaseAmountFormatted),
              ),
          ],
        ),
      ),
    );
  }

  String _periodLabel(String period) {
    final l10n = AppLocalizations.of(context);
    switch (period) {
      case 'week':
        return l10n.analyticsThisWeek;
      case '3m':
        return l10n.analyticsLastThreeMonths;
      case '6m':
        return l10n.analyticsLastSixMonths;
      case 'year':
        return l10n.analyticsLastYear;
      case 'lifetime':
        return l10n.analyticsAllHistory;
      case 'custom':
        return l10n.analyticsCustomRange;
      default:
        return l10n.analyticsThisMonth;
    }
  }

  IconData _timelineIcon(String kind) {
    switch (kind) {
      case 'income':
        return Icons.south_west;
      case 'refund':
        return Icons.undo_outlined;
      case 'transfer':
        return Icons.swap_horiz;
      case 'subscription':
        return Icons.autorenew;
      case 'bill':
        return Icons.receipt_long;
      case 'unusual':
        return Icons.warning_amber;
      default:
        return Icons.shopping_bag_outlined;
    }
  }

  String _timelineKind(String kind) {
    final l10n = AppLocalizations.of(context);
    switch (kind) {
      case 'income':
        return l10n.analyticsTimelineKindIncome;
      case 'refund':
        return l10n.analyticsTimelineKindRefund;
      case 'transfer':
        return l10n.analyticsTimelineKindTransfer;
      case 'subscription':
        return l10n.analyticsTimelineKindSubscription;
      case 'bill':
        return l10n.analyticsTimelineKindBill;
      case 'unusual':
        return l10n.analyticsTimelineKindUnusual;
      default:
        return l10n.analyticsTimelineKindSpending;
    }
  }

  Widget _subscriptionCard(BuildContext context) {
    final report = _subscriptions!;
    final l10n = AppLocalizations.of(context);
    return Card(
      child: ListTile(
        leading: const Icon(Icons.autorenew),
        title: Text(l10n.analyticsRecurringCharges(report.count)),
        subtitle: Text(
          '${report.monthlyTotalFormatted}/month · ${report.annualTotalFormatted}/year',
        ),
        trailing: report.priceIncreases.isEmpty
            ? null
            : Chip(
                label: Text(l10n
                    .analyticsPriceRiseCount(report.priceIncreases.length))),
      ),
    );
  }

  Widget _priorityChip(ThemeData theme, String priority) {
    final l10n = AppLocalizations.of(context);
    final (label, color) = switch (priority) {
      'critical' => (l10n.analyticsPriorityCritical, theme.colorScheme.error),
      'important' => (
          l10n.analyticsPriorityImportant,
          theme.colorScheme.tertiary
        ),
      _ => (l10n.analyticsPriorityInfo, theme.colorScheme.outline),
    };
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: color.withValues(alpha: 0.35)),
      labelStyle: TextStyle(color: color, fontSize: 11),
    );
  }
}
