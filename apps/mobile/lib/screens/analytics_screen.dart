import 'package:flutter/material.dart';

import '../api/client.dart';
import '../design/design.dart';
import '../models/models.dart';
import '../widgets/health_score_card.dart';
import '../widgets/spending_chart.dart';
import '../widgets/trend_chart.dart';
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
      final results = await Future.wait([
        widget.api.analytics(
          period: _period,
          from: _period == 'custom' ? _customFrom : null,
          to: _period == 'custom' ? _customTo : null,
        ),
        widget.api.insights(),
        widget.api.healthScore(),
        widget.api.subscriptions(),
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
        _error = error.toString();
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
        helpText: 'Choose the first day',
      );
      if (!mounted || start == null) return;
      final end = await showDatePicker(
        context: context,
        firstDate: start,
        lastDate: now,
        initialDate: _customTo ?? now,
        helpText: 'Choose the last day',
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        actions: [
          IconButton(
            tooltip: 'Refresh analytics',
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
          title: 'Analytics are unavailable',
          message:
              'Check your connection and try again. Nothing has been lost.',
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
            decoration: const InputDecoration(labelText: 'Analytics period'),
            items: const [
              DropdownMenuItem(value: 'week', child: Text('This week')),
              DropdownMenuItem(value: 'month', child: Text('This month')),
              DropdownMenuItem(value: '3m', child: Text('Last 3 months')),
              DropdownMenuItem(value: '6m', child: Text('Last 6 months')),
              DropdownMenuItem(value: 'year', child: Text('Last year')),
              DropdownMenuItem(value: 'lifetime', child: Text('All history')),
              DropdownMenuItem(value: 'custom', child: Text('Custom range')),
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
          ],
          if (categories.isNotEmpty) ...[
            SpendingChart(categories: categories),
            const SizedBox(height: 20),
          ] else
            const FinEmptyState(
              icon: Icons.insights_outlined,
              title: 'Not enough transaction history yet',
              message: 'Connect a bank or add transactions to see trends.',
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
            Text('Explainable insights',
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
                    subtitle: Text(
                      '${insight.detail}\nBased on ${insight.evidenceCount} transaction(s)',
                    ),
                    isThreeLine: true,
                  ),
                )),
          ],
          if (analytics.timeline.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Financial timeline',
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
                          subtitle: Text('${event.date} · ${event.kind}'),
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
            label: const Text('Plan a purchase or view your forecast'),
          ),
        ],
      ),
    );
  }

  Widget _metricGrid(BuildContext context, AnalyticsReport analytics) {
    final values = [
      ('Income', analytics.totalIncomeFormatted),
      ('Net expenses', analytics.netExpensesFormatted),
      ('Savings', analytics.savingsFormatted),
      ('Savings rate', '${analytics.savingsRate.toStringAsFixed(1)}%'),
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
    final detail = !velocity.enoughHistory
        ? 'Keep using FINVERSE to build a useful historical baseline.'
        : velocity.percentDelta == null
            ? 'There is not enough comparable history for a pace comparison.'
            : 'Projected spending is ${velocity.percentDelta!.abs().toStringAsFixed(1)}% '
                '${velocity.percentDelta! >= 0 ? 'above' : 'below'} your historical pace.';
    return Card(
      child: ListTile(
        leading: const Icon(Icons.speed),
        title: Text('Spending pace: ${velocity.projectedPeriodSpendFormatted}'),
        subtitle:
            Text('$detail\nCurrent: ${velocity.currentPeriodSpendFormatted}'),
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
            Text('Refunds matched', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'These refunds were linked to earlier purchases using merchant and amount evidence.',
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
    switch (period) {
      case 'week':
        return 'This week';
      case '3m':
        return 'Last 3 months';
      case '6m':
        return 'Last 6 months';
      case 'year':
        return 'Last year';
      case 'lifetime':
        return 'All history';
      case 'custom':
        return 'Custom range';
      default:
        return 'This month';
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

  Widget _subscriptionCard(BuildContext context) {
    final report = _subscriptions!;
    return Card(
      child: ListTile(
        leading: const Icon(Icons.autorenew),
        title: Text(
            '${report.count} recurring charge${report.count == 1 ? '' : 's'}'),
        subtitle: Text(
          '${report.monthlyTotalFormatted}/month · ${report.annualTotalFormatted}/year',
        ),
        trailing: report.priceIncreases.isEmpty
            ? null
            : Chip(label: Text('${report.priceIncreases.length} price rise')),
      ),
    );
  }
}
