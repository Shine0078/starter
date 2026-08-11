import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/billing_policy.dart';
import '../api/client.dart';
import '../models/models.dart';

/// Human labels for the server's entitlement slugs.
///
/// Anything unrecognised falls back to a readable version of the slug rather
/// than being hidden: a client that silently drops a capability it has not been
/// taught about would under-sell a plan the user is already paying for.
const _entitlementLabels = <String, String>{
  'unlimited_bank_links': 'Connect multiple institutions',
  'monthly_pdf_report': 'Monthly PDF report',
  'cash_flow_planning': 'Cash-flow forecast and purchase planning',
  'data_export': 'Full data export',
};

String entitlementLabel(String slug) =>
    _entitlementLabels[slug] ??
    slug
        .split('_')
        .map((word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');

/// Plan state, what each tier includes, and the way to change it.
class PlanScreen extends StatefulWidget {
  const PlanScreen(
      {required this.api, BillingPurchaseMode? purchaseMode, super.key})
      : purchaseMode = purchaseMode ?? kBillingPurchaseMode;

  final ApiClient api;

  /// Overridable so both the informational and link-out presentations can be
  /// tested. Production uses the compile-time constant.
  final BillingPurchaseMode purchaseMode;

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  PlanSummary? _summary;
  List<BillingPlan> _plans = const [];
  String? _error;
  var _loading = true;
  var _working = false;

  /// Annual is preselected where it is offered. It is the better deal for the
  /// customer and materially better for the business, and a default nobody
  /// changes is the most-taken path.
  String _interval = 'year';

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
      final results = await Future.wait([
        widget.api.planSummary(),
        widget.api.billingPlans(),
      ]);
      if (!mounted) return;
      final summary = results[0] as PlanSummary;
      setState(() {
        _summary = summary;
        _plans = results[1] as List<BillingPlan>;
        // Never leave the selection on an interval this deployment cannot sell,
        // which would produce a checkout the server has to refuse.
        if (!summary.intervals.contains(_interval)) {
          _interval =
              summary.intervals.isEmpty ? 'month' : summary.intervals.first;
        }
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

  Future<void> _upgrade(String plan) async {
    if (_working) return;
    setState(() => _working = true);
    try {
      final session = await widget.api.startCheckout(plan, interval: _interval);
      if (!mounted) return;
      await _open(session.url, 'checkout');
      // The webhook that records the purchase arrives independently of the
      // browser coming back, so this reload may still show the old plan. Say so
      // rather than leaving someone who has just paid staring at "Free".
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Finish in your browser. Your plan updates here once '
              'the payment is confirmed.'),
        ));
      }
      await _load();
    } catch (error) {
      _report(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _manage() async {
    if (_working) return;
    setState(() => _working = true);
    try {
      final url = await widget.api.billingPortalUrl();
      if (!mounted) return;
      await _open(url, 'the billing portal');
    } catch (error) {
      _report(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _open(String url, String what) async {
    final uri = Uri.tryParse(url);
    // Only ever hand the system browser an https URL from our own API. A
    // launcher that will follow any scheme is a way to turn a compromised
    // response into an intent on the device.
    if (uri == null || uri.scheme != 'https') {
      _showMessage('Could not open $what.');
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) _showMessage('Could not open $what.');
  }

  void _report(Object error) {
    _showMessage(switch (error) {
      ApiException(statusCode: 503) =>
        'Billing is not configured on this server yet.',
      _ => friendlyErrorMessage(error),
    });
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Your plan'),
          actions: [
            IconButton(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh',
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
              const Text('Could not load your plan'),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Try again')),
            ],
          ),
        ),
      );
    }

    final summary = _summary!;

    // A deployment with no payment provider applies no limits, so a tier
    // comparison would be describing a paywall that does not exist here.
    if (!summary.gatesEnforced) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.all_inclusive),
              title: const Text('Everything is available'),
              subtitle: Text(
                'This server does not limit features by plan. You can connect '
                'up to ${summary.bankLinkLimit} institutions and use every '
                'feature.',
              ),
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _currentPlanCard(summary),
        if (summary.needsPaymentAttention) _paymentWarning(summary),
        const SizedBox(height: 20),
        _heading('WHAT EACH PLAN INCLUDES'),
        if (_showsIntervalChoice(summary)) _intervalToggle(summary),
        ..._plans.map((plan) => _planCard(plan, summary)),
        const SizedBox(height: 12),
        if (summary.purchaseAvailable && !canPurchaseWith(widget.purchaseMode))
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              purchaseUnavailableReason(widget.purchaseMode),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        if (!summary.purchaseAvailable)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Paid plans are not available on this server.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    );
  }

  /// Only worth showing when there is a real choice and the user can act on it.
  bool _showsIntervalChoice(PlanSummary summary) =>
      summary.intervals.length > 1 &&
      summary.purchaseAvailable &&
      canPurchaseWith(widget.purchaseMode) &&
      summary.isFree;

  Widget _intervalToggle(PlanSummary summary) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: SegmentedButton<String>(
          segments: [
            for (final interval in summary.intervals)
              ButtonSegment(
                value: interval,
                label: Text(interval == 'year' ? 'Yearly' : 'Monthly'),
              ),
          ],
          selected: {_interval},
          onSelectionChanged: _working
              ? null
              : (selection) => setState(() => _interval = selection.first),
        ),
      );

  Widget _currentPlanCard(PlanSummary summary) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('CURRENT PLAN',
                style:
                    theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2)),
            const SizedBox(height: 6),
            Text(summary.planName, style: theme.textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(_stateLine(summary), style: theme.textTheme.bodyMedium),
            if (!summary.isFree) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _working ? null : _manage,
                icon: const Icon(Icons.open_in_new),
                label: const Text('Manage subscription'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Deliberately worded as "still active". A failed renewal keeps access while
  /// the provider retries (ADR-0007), and telling someone they have been cut
  /// off when they have not is how you lose a customer who would have paid.
  Widget _paymentWarning(PlanSummary summary) => Card(
        color: Theme.of(context).colorScheme.errorContainer,
        child: ListTile(
          leading: const Icon(Icons.credit_card_off_outlined),
          title: const Text('Payment problem'),
          subtitle: const Text(
            'We could not take your last payment. Your plan is still active '
            'while we retry — update your card to keep it.',
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: _working ? null : _manage,
        ),
      );

  String _stateLine(PlanSummary summary) {
    if (summary.isFree) {
      return 'Connect up to ${summary.bankLinkLimit} '
          '${summary.bankLinkLimit == 1 ? 'institution' : 'institutions'}.';
    }
    final renews = summary.currentPeriodEnd;
    if (summary.cancelAtPeriodEnd && renews != null) {
      return 'Ends ${_date(renews)}. You keep everything until then.';
    }
    if (summary.isTrialing && summary.trialEnd != null) {
      return 'Trial ends ${_date(summary.trialEnd!)}.';
    }
    if (renews != null) return 'Renews ${_date(renews)}.';
    return 'Active.';
  }

  Widget _planCard(BillingPlan plan, PlanSummary summary) {
    final theme = Theme.of(context);
    final isCurrent = plan.id == summary.plan;
    final canBuy = plan.purchasable &&
        !isCurrent &&
        summary.purchaseAvailable &&
        canPurchaseWith(widget.purchaseMode);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(plan.name, style: theme.textTheme.titleMedium),
                ),
                if (isCurrent)
                  Chip(
                    label: const Text('Current'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${plan.bankLinkLimit} connected '
              '${plan.bankLinkLimit == 1 ? 'institution' : 'institutions'}',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            ...plan.entitlements.map(
              (slug) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text(entitlementLabel(slug))),
                  ],
                ),
              ),
            ),
            if (canBuy) ...[
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _working ? null : () => _upgrade(plan.id),
                child: Text(summary.trialDays > 0
                    ? 'Start ${summary.trialDays}-day free trial'
                    : 'Upgrade to ${plan.name}'),
              ),
              if (summary.trialDays > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    // Said plainly and up front. A trial that quietly becomes a
                    // charge is the single most common complaint about
                    // subscription apps, and burying it costs more in refunds
                    // and chargebacks than it ever gains in signups.
                    'Then billed ${_interval == 'year' ? 'yearly' : 'monthly'}. '
                    'Cancel any time before it ends.',
                    style: theme.textTheme.bodySmall,
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _heading(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
        child: Text(
          text,
          style: Theme.of(context)
              .textTheme
              .labelSmall
              ?.copyWith(letterSpacing: 1.2),
        ),
      );

  String _date(DateTime value) => DateFormat.yMMMd().format(value.toLocal());
}

/// Explains a refused feature and offers the way out.
///
/// Called from wherever a [PlanUpgradeRequiredException] is caught, so every
/// gated feature produces the same, specific explanation rather than each
/// screen inventing its own wording.
Future<void> showUpgradeSheet(
  BuildContext context,
  ApiClient api,
  PlanUpgradeRequiredException reason,
) async {
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.lock_outline),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  reason.entitlement == null
                      ? 'Included in a paid plan'
                      : entitlementLabel(reason.entitlement!),
                  style: Theme.of(sheetContext).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(reason.message),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  child: const Text('Not now'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    Navigator.of(sheetContext).pop();
                    Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => PlanScreen(api: api),
                    ));
                  },
                  child: const Text('See plans'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
