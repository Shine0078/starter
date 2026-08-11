import 'package:flutter/material.dart';

import '../api/client.dart';
import '../design/design.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';

class SubscriptionsScreen extends StatefulWidget {
  const SubscriptionsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends State<SubscriptionsScreen> {
  SubscriptionsReport? _report;
  String? _error;
  String _currency = 'USD';
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
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
      final report = await widget.api.subscriptions(currency: _currency);
      if (!mounted) return;
      setState(() {
        _report = report;
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.profileSubscriptionsTitle),
        actions: [
          IconButton(
            tooltip: l10n.subscriptionsRefreshTooltip,
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final l10n = AppLocalizations.of(context);
    if (_loading) {
      return ListView(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [FinListSkeleton(rows: 5)],
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 42),
              const SizedBox(height: 12),
              Text(l10n.subscriptionsLoadError),
              const SizedBox(height: 6),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(l10n.commonRetry)),
            ],
          ),
        ),
      );
    }

    final report = _report!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.subscriptionsRecurringCount(
                        report.count, report.currency),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 14),
                  _totalRow(l10n.subscriptionsEstimatedMonthly,
                      report.monthlyTotalFormatted),
                  _totalRow(l10n.subscriptionsEstimatedYearly,
                      report.annualTotalFormatted),
                ],
              ),
            ),
          ),
          if (report.priceIncreases.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(l10n.subscriptionsPriceChanges,
                style: Theme.of(context).textTheme.labelSmall),
            ...report.priceIncreases.map(
              (change) => Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: ListTile(
                  leading: const Icon(Icons.trending_up),
                  title: Text(l10n.subscriptionsPriceIncrease(
                      change.merchant, change.percent)),
                  subtitle: Text(l10n.subscriptionsAnnualImpact(
                      change.from, change.to, change.annualImpact)),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text(l10n.subscriptionsDetected,
              style: Theme.of(context).textTheme.labelSmall),
          if (report.subscriptions.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(
                children: [
                  const Icon(Icons.subscriptions_outlined, size: 42),
                  const SizedBox(height: 12),
                  Text(l10n.subscriptionsEmptyTitle),
                  const SizedBox(height: 6),
                  Text(
                    l10n.subscriptionsEmptyDetail,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else
            ...report.subscriptions.map(
              (subscription) => Card(
                child: ListTile(
                  leading: const CircleAvatar(
                    child: Icon(Icons.autorenew_outlined),
                  ),
                  title: Text(subscription.merchant),
                  subtitle: Text(
                    '${subscription.typicalAmountFormatted} · ${_cadence(subscription.cadence)}\n'
                    '${l10n.subscriptionsNextExpected(subscription.nextExpected)}',
                  ),
                  isThreeLine: true,
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(subscription.annualCostFormatted),
                      Text(l10n.subscriptionsPerYear),
                      if (subscription.hasPriceIncrease)
                        const Icon(Icons.warning_amber, size: 18),
                    ],
                  ),
                ),
              ),
            ),
          if (report.possiblyCancelled.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(l10n.subscriptionsMayHaveEnded,
                style: Theme.of(context).textTheme.labelSmall),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(report.possiblyCancelled.join(', ')),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            l10n.subscriptionsDisclaimer,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _totalRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [Text(label), Text(value)],
        ),
      );

  String _cadence(String value) {
    final l10n = AppLocalizations.of(context);
    return switch (value) {
      'weekly' => l10n.subscriptionsCadenceWeekly,
      'biweekly' => l10n.subscriptionsCadenceBiweekly,
      'monthly' => l10n.subscriptionsCadenceMonthly,
      'quarterly' => l10n.subscriptionsCadenceQuarterly,
      'annual' => l10n.subscriptionsCadenceAnnual,
      _ => value,
    };
  }
}
