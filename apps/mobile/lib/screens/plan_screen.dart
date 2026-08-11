import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/billing_policy.dart';
import '../api/client.dart';
import '../l10n/app_localizations.dart';
import '../l10n/localization_fallback.dart';
import '../models/models.dart';

/// Human labels for the server's entitlement slugs.
///
/// Anything unrecognised falls back to a readable version of the slug rather
/// than being hidden: a client that silently drops a capability it has not been
/// taught about would under-sell a plan the user is already paying for.
String entitlementLabel(AppLocalizations l10n, String slug) => switch (slug) {
      'unlimited_bank_links' => l10n.planEntitlementMultipleInstitutions,
      'monthly_pdf_report' => l10n.planEntitlementMonthlyPdf,
      'cash_flow_planning' => l10n.planEntitlementCashFlow,
      'data_export' => l10n.planEntitlementDataExport,
      _ => slug
          .split('_')
          .map((word) => word.isEmpty
              ? word
              : '${word[0].toUpperCase()}${word.substring(1)}')
          .join(' '),
    };

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

  AppLocalizations get _l10n => localizedOrEnglish(context);

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
      await _open(session.url, _l10n.planCheckout);
      // The webhook that records the purchase arrives independently of the
      // browser coming back, so this reload may still show the old plan. Say so
      // rather than leaving someone who has just paid staring at "Free".
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_l10n.planCheckoutPending),
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
      await _open(url, _l10n.planBillingPortal);
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
      _showMessage(_l10n.planCouldNotOpen(what));
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) _showMessage(_l10n.planCouldNotOpen(what));
  }

  void _report(Object error) {
    _showMessage(switch (error) {
      ApiException(statusCode: 503) => _l10n.planBillingNotConfigured,
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
          title: Text(_l10n.planTitle),
          actions: [
            IconButton(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: _l10n.planRefreshAction,
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
              Text(_l10n.planLoadFailed),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(_l10n.planTryAgain)),
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
              title: Text(_l10n.planEverythingAvailable),
              subtitle: Text(_l10n.planNoLimits(summary.bankLinkLimit)),
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
        _heading(_l10n.planIncludesSection),
        if (_showsIntervalChoice(summary)) _intervalToggle(summary),
        ..._plans.map((plan) => _planCard(plan, summary)),
        const SizedBox(height: 12),
        if (summary.purchaseAvailable && !canPurchaseWith(widget.purchaseMode))
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              _purchaseUnavailableReason(),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        if (!summary.purchaseAvailable)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              _l10n.planPaidUnavailable,
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

  String _purchaseUnavailableReason() => switch (widget.purchaseMode) {
        BillingPurchaseMode.informational => _l10n.planWebPurchaseUnavailable,
        BillingPurchaseMode.nativeStore => _l10n.planNativePurchaseUnavailable,
        BillingPurchaseMode.linkOut => '',
      };

  Widget _intervalToggle(PlanSummary summary) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: SegmentedButton<String>(
          segments: [
            for (final interval in summary.intervals)
              ButtonSegment(
                value: interval,
                label: Text(
                    interval == 'year' ? _l10n.planYearly : _l10n.planMonthly),
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
            Text(_l10n.planCurrentSection,
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
                label: Text(_l10n.planManageSubscription),
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
          title: Text(_l10n.planPaymentProblem),
          subtitle: Text(_l10n.planPaymentProblemDetail),
          /*
            'We could not take your last payment. Your plan is still active '
            'while we retry — update your card to keep it.',
          ), */
          trailing: const Icon(Icons.chevron_right),
          onTap: _working ? null : _manage,
        ),
      );

  String _stateLine(PlanSummary summary) {
    if (summary.isFree) {
      return _l10n.planFreeLimit(
        summary.bankLinkLimit,
        summary.bankLinkLimit == 1
            ? _l10n.bankInstitution
            : _l10n.bankInstitutions,
      );
    }
    final renews = summary.currentPeriodEnd;
    if (summary.cancelAtPeriodEnd && renews != null) {
      return _l10n.planEnds(_date(renews));
    }
    if (summary.isTrialing && summary.trialEnd != null) {
      return _l10n.planTrialEnds(_date(summary.trialEnd!));
    }
    if (renews != null) return _l10n.planRenews(_date(renews));
    return _l10n.planActive;
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
                    label: Text(_l10n.planCurrentChip),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              _l10n.planConnectedInstitutions(
                plan.bankLinkLimit,
                plan.bankLinkLimit == 1
                    ? _l10n.bankInstitution
                    : _l10n.bankInstitutions,
              ),
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
                    Expanded(child: Text(entitlementLabel(_l10n, slug))),
                  ],
                ),
              ),
            ),
            if (canBuy) ...[
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _working ? null : () => _upgrade(plan.id),
                child: Text(summary.trialDays > 0
                    ? _l10n.planStartTrial(summary.trialDays)
                    : _l10n.planUpgradeTo(plan.name)),
              ),
              if (summary.trialDays > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    // Said plainly and up front. A trial that quietly becomes a
                    // charge is the single most common complaint about
                    // subscription apps, and burying it costs more in refunds
                    // and chargebacks than it ever gains in signups.
                    _l10n.planTrialTerms(
                      _interval == 'year'
                          ? _l10n.planYearly.toLowerCase()
                          : _l10n.planMonthly.toLowerCase(),
                    ),
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

  String _date(DateTime value) =>
      MaterialLocalizations.of(context).formatMediumDate(value.toLocal());
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
    builder: (sheetContext) {
      final l10n = localizedOrEnglish(sheetContext);
      return Padding(
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
                        ? l10n.planPaidFeature
                        : entitlementLabel(l10n, reason.entitlement!),
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
                    child: Text(l10n.planNotNow),
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
                    child: Text(l10n.planSeePlans),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}
