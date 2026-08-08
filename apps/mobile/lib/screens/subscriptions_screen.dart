import 'package:flutter/material.dart';

import '../api/client.dart';
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
      final report = await widget.api.subscriptions();
      if (!mounted) return;
      setState(() {
        _report = report;
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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Subscriptions'),
          actions: [
            IconButton(
              tooltip: 'Refresh subscriptions',
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: _buildBody(),
      );

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 42),
              const SizedBox(height: 12),
              const Text('Could not load subscriptions'),
              const SizedBox(height: 6),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Try again')),
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
                    '${report.count} recurring payment${report.count == 1 ? '' : 's'}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 14),
                  _totalRow('Estimated monthly', report.monthlyTotalFormatted),
                  _totalRow('Estimated yearly', report.annualTotalFormatted),
                ],
              ),
            ),
          ),
          if (report.priceIncreases.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('PRICE CHANGES',
                style: Theme.of(context).textTheme.labelSmall),
            ...report.priceIncreases.map(
              (change) => Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: ListTile(
                  leading: const Icon(Icons.trending_up),
                  title:
                      Text('${change.merchant} increased ${change.percent}%'),
                  subtitle: Text(
                    '${change.from} to ${change.to} • ${change.annualImpact} yearly impact',
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text('DETECTED', style: Theme.of(context).textTheme.labelSmall),
          if (report.subscriptions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Column(
                children: [
                  Icon(Icons.subscriptions_outlined, size: 42),
                  SizedBox(height: 12),
                  Text('No recurring subscriptions detected.'),
                  SizedBox(height: 6),
                  Text(
                    'Connect and sync a bank with at least a few months of transactions.',
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
                    '${subscription.typicalAmountFormatted} • ${_cadence(subscription.cadence)}\n'
                    'Next expected ${subscription.nextExpected}',
                  ),
                  isThreeLine: true,
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(subscription.annualCostFormatted),
                      const Text('/year'),
                      if (subscription.hasPriceIncrease)
                        const Icon(Icons.warning_amber, size: 18),
                    ],
                  ),
                ),
              ),
            ),
          if (report.possiblyCancelled.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('MAY HAVE ENDED',
                style: Theme.of(context).textTheme.labelSmall),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(report.possiblyCancelled.join(', ')),
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Text(
            'Subscriptions are detected from transaction patterns. Confirm charges with the merchant before taking action.',
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

  String _cadence(String value) => switch (value) {
        'weekly' => 'Weekly',
        'biweekly' => 'Every two weeks',
        'monthly' => 'Monthly',
        'quarterly' => 'Quarterly',
        'annual' => 'Yearly',
        _ => value,
      };
}
