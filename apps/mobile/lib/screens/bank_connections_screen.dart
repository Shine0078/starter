import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/client.dart';
import '../design/design.dart';
import '../api/plaid_link.dart';
import '../l10n/app_localizations.dart';
import '../l10n/app_localizations_en.dart';
import '../models/models.dart';
import 'plan_screen.dart';

AppLocalizations _bankLocalizations(BuildContext context) {
  return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
      AppLocalizationsEn();
}

class BankConnectionsScreen extends StatefulWidget {
  BankConnectionsScreen({required this.api, PlaidLink? plaidLink, super.key})
      : plaidLink = plaidLink ?? createPlaidLink();

  final ApiClient api;
  final PlaidLink plaidLink;

  @override
  State<BankConnectionsScreen> createState() => _BankConnectionsScreenState();
}

class _BankConnectionsScreenState extends State<BankConnectionsScreen> {
  List<BankLink> _links = const [];
  List<Account> _accounts = const [];
  PlanSummary? _plan;
  bool _loading = true;
  bool _working = false;
  String? _error;

  AppLocalizations get _l10n => _bankLocalizations(context);

  /// Connections that count against the plan limit, matching the server's rule
  /// in BankingService: a revoked link is not occupying a slot.
  int get _activeLinks =>
      _links.where((link) => link.status != 'revoked').length;

  bool get _atLinkLimit {
    final plan = _plan;
    return plan != null && _activeLinks >= plan.bankLinkLimit;
  }

  @override
  void initState() {
    super.initState();
    widget.api.dataRevision.addListener(_onDataChanged);
    _load();
    _recoverPlaidResult();
  }

  @override
  void dispose() {
    widget.api.dataRevision.removeListener(_onDataChanged);
    super.dispose();
  }

  void _onDataChanged() {
    if (!mounted || _loading || _working) return;
    unawaited(_load());
  }

  /// Loaded separately and allowed to fail: not knowing the plan costs a
  /// pre-check, and the server still refuses over-limit connections. Folding it
  /// into the main load would let a billing hiccup hide the accounts list.
  Future<void> _loadPlan() async {
    try {
      final plan = await widget.api.planSummary();
      if (mounted) setState(() => _plan = plan);
    } catch (_) {
      if (mounted) setState(() => _plan = null);
    }
  }

  Future<void> _load() async {
    widget.api.resetOfflineStatus();
    unawaited(_loadPlan());
    try {
      final results = await Future.wait([
        widget.api.bankLinks(),
        widget.api.accounts(),
      ]);
      if (mounted) {
        setState(() {
          _links = results[0] as List<BankLink>;
          _accounts = results[1] as List<Account>;
          _loading = false;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = _friendly(error);
        });
      }
    }
  }

  Future<void> _recoverPlaidResult() async {
    try {
      final result = await widget.plaidLink.consumePending();
      if (result?.succeeded == true && result!.publicToken != null) {
        await _exchange(result);
        await _load();
      }
    } on MissingPluginException {
      // Expected in widget tests and on platforms without the Android bridge.
    } catch (error) {
      // An OAuth return can land after a cold start or a process restart. A
      // failed exchange (plan limit, provider outage, revoked link) must be
      // shown, not left as an unhandled asynchronous error.
      if (mounted) setState(() => _error = _friendly(error));
    }
  }

  Future<void> _connect([BankLink? existing]) async {
    if (_working) return;

    // Checked before the password prompt and before Plaid Link opens. The
    // server is still the authority, but discovering the limit only *after*
    // someone has typed their password and authenticated with their bank would
    // waste the most effortful part of the flow.
    //
    // Reconnecting an existing link is exempt: it occupies a slot already.
    if (existing == null && _atLinkLimit) {
      final plan = _plan!;
      await showUpgradeSheet(
        context,
        widget.api,
        PlanUpgradeRequiredException(
          path: '/bank-links/exchange',
          message: _l10n.bankPlanConnectionLimit(
            plan.planName,
            plan.bankLinkLimit,
            plan.bankLinkLimit == 1
                ? _l10n.bankInstitution
                : _l10n.bankInstitutions,
          ),
          entitlement: 'unlimited_bank_links',
        ),
      );
      return;
    }

    final password = await _confirmPassword(
      existing == null
          ? _l10n.bankConnectAction
          : _l10n.bankReconnectThisAction,
    );
    if (password == null) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final token = await widget.api.createBankLinkToken(
        password: password,
        linkId: existing?.id,
        platform: widget.plaidLink.platform,
      );
      final result = await widget.plaidLink.open(token);
      if (!result.succeeded) {
        if (result.errorCode != null) {
          _show(result.errorMessage ?? _l10n.bankConnectionNotCompleted);
        }
        return;
      }
      if (existing != null) {
        await widget.api.syncBankLink(existing.id);
      } else {
        await _exchange(result);
      }
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<String?> _confirmPassword(String action) async {
    var enteredPassword = '';
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_l10n.bankStepUpTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _l10n.bankStepUpDetail(action),
            ),
            const SizedBox(height: 16),
            TextField(
              autofocus: true,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onChanged: (value) => enteredPassword = value,
              onSubmitted: (value) => Navigator.pop(dialogContext, value),
              decoration: InputDecoration(
                labelText: _l10n.bankPasswordLabel,
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(_l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, enteredPassword),
            child: Text(_l10n.bankContinueAction),
          ),
        ],
      ),
    );
    if (value == null || value.isEmpty) return null;
    return value;
  }

  Future<void> _exchange(PlaidLinkResult result) async {
    final publicToken = result.publicToken;
    if (publicToken == null) {
      throw StateError('Plaid did not return a public token.');
    }
    await widget.api.exchangeBankToken(
      publicToken: publicToken,
      institutionName: result.institutionName ?? 'Connected institution',
      institutionId: result.institutionId,
    );
  }

  Future<void> _sync(BankLink link) async {
    if (_working) return;
    setState(() => _working = true);
    try {
      await widget.api.syncBankLink(link.id);
      await _load();
      _show(_l10n.bankTransactionsCurrent);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _disconnect(BankLink link) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_l10n.bankDisconnectTitle(link.institutionName)),
        content: Text(_l10n.bankDisconnectDetail),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_l10n.bankDisconnectAction),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _working = true);
    try {
      await widget.api.disconnectBank(link.id);
      await _load();
      _show(_l10n.bankAccessRevoked);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  int? _minorUnits(String input) {
    final match = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(input.trim());
    if (match == null) return null;
    final whole = int.tryParse(match.group(1)!);
    final cents = int.tryParse((match.group(2) ?? '').padRight(2, '0')) ?? 0;
    if (whole == null) return null;
    return whole * 100 + cents;
  }

  Future<void> _editManual([Account? existing]) async {
    var enteredName = existing?.name ?? '';
    var enteredBalanceText = existing == null
        ? ''
        : (existing.balanceCurrent.abs() / 100).toStringAsFixed(2);
    var enteredCurrency = existing?.currency ??
        (_accounts.isEmpty ? 'USD' : _accounts.first.currency);
    var type = existing?.type ?? 'cash';
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null
              ? _l10n.bankAddManualTitle
              : _l10n.bankEditManualTitle),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  initialValue: enteredName,
                  onChanged: (value) => enteredName = value,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: _l10n.bankAccountNameLabel,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: InputDecoration(
                    labelText: _l10n.bankAccountTypeLabel,
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    DropdownMenuItem(
                        value: 'cash', child: Text(_l10n.bankManualCash)),
                    DropdownMenuItem(
                        value: 'checking',
                        child: Text(_l10n.bankManualChecking)),
                    DropdownMenuItem(
                        value: 'savings', child: Text(_l10n.bankManualSavings)),
                    DropdownMenuItem(
                        value: 'investment',
                        child: Text(_l10n.bankManualInvestment)),
                    DropdownMenuItem(
                        value: 'loan', child: Text(_l10n.bankManualLoan)),
                  ],
                  onChanged: (value) {
                    if (value != null) setDialogState(() => type = value);
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: enteredBalanceText,
                  onChanged: (value) => enteredBalanceText = value,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: type == 'loan'
                        ? _l10n.bankAmountOwedLabel
                        : _l10n.bankCurrentValueLabel,
                    helperText: _l10n.bankAmountHelper,
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: enteredCurrency,
                  onChanged: (value) => enteredCurrency = value,
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 3,
                  decoration: InputDecoration(
                    labelText: _l10n.bankCurrencyLabel,
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(_l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(existing == null
                  ? _l10n.bankAddAccountAction
                  : _l10n.bankSaveChangesAction),
            ),
          ],
        ),
      ),
    );

    enteredName = enteredName.trim();
    enteredCurrency = enteredCurrency.trim().toUpperCase();
    final enteredBalance = _minorUnits(enteredBalanceText);
    if (submitted != true || !mounted) return;
    if (enteredName.isEmpty ||
        !RegExp(r'^[A-Z]{3}$').hasMatch(enteredCurrency) ||
        enteredBalance == null) {
      _show(_l10n.bankManualAccountInvalid);
      return;
    }

    setState(() => _working = true);
    try {
      final signedBalance = type == 'loan' ? -enteredBalance : enteredBalance;
      if (existing == null) {
        await widget.api.createManualAccount(
          name: enteredName,
          type: type,
          currency: enteredCurrency,
          balanceCurrent: signedBalance,
        );
      } else {
        await widget.api.updateManualAccount(
          existing.id,
          name: enteredName,
          type: type,
          currency: enteredCurrency,
          balanceCurrent: signedBalance,
        );
      }
      await _load();
      _show(existing == null
          ? _l10n.bankManualAccountAdded
          : _l10n.bankManualAccountUpdated);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _removeManual(Account account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_l10n.bankRemoveManualTitle(account.name)),
        content: Text(_l10n.bankRemoveManualDetail),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(_l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_l10n.bankRemoveAction),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _working = true);
    try {
      await widget.api.deleteManualAccount(account.id);
      await _load();
      _show(_l10n.bankManualAccountRemoved);
    } catch (error) {
      if (mounted) setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _show(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  /// Null when there is nothing to put in the error banner.
  String? _friendly(Object error) {
    // A plan refusal is not an error message; it is an offer. Surfacing it in
    // the red banner alongside outages would read as something broken.
    if (error is PlanUpgradeRequiredException) {
      unawaited(_offerUpgrade(error));
      return null;
    }
    if (error is PlaidLinkUnavailable || error is MissingPluginException) {
      return _l10n.bankUnavailableInBuild;
    }

    if (error is ApiException) {
      try {
        final decoded = jsonDecode(error.body);
        if (decoded is Map<String, dynamic>) {
          final code = decoded['code'];
          final message = decoded['message'];
          if (code == 'PLAID_CONFIGURATION') {
            if (message is String && message.isNotEmpty) return message;
            return _l10n.bankSetupIncomplete;
          }
          if (error.statusCode == 503 &&
              message is String &&
              message.isNotEmpty) {
            return message;
          }
        }
      } catch (_) {
        // Fall through to a generic, actionable message for non-JSON errors.
      }
      if (error.statusCode == 503) {
        return _l10n.bankProviderUnavailable;
      }
    }

    final value = error.toString();
    if (value.contains('503')) {
      // The old wording stopped at "not configured", which reads as a dead end.
      // Sandbox credentials are free and take a few minutes, so say that.
      return _l10n.bankCredentialsMissing;
    }
    return value;
  }

  Future<void> _offerUpgrade(PlanUpgradeRequiredException reason) async {
    if (!mounted) return;
    await showUpgradeSheet(context, widget.api, reason);
    // The plan may now be different, and the limit with it.
    if (mounted) await _loadPlan();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = _bankLocalizations(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.bankAccountsTitle),
        actions: [
          IconButton(
              onPressed: _working ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: l10n.bankRefreshAction),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          FloatingActionButton.extended(
            heroTag: 'add-manual-account',
            onPressed: _working ? null : () => _editManual(),
            icon: const Icon(Icons.add_card),
            label: Text(l10n.bankAddManualAction),
          ),
          // Each platform implementation advertises whether its Plaid Link
          // surface is available (Web uses Plaid Link for Web; Android uses
          // the native SDK).
          if (widget.plaidLink.isSupported) ...[
            const SizedBox(height: 10),
            FloatingActionButton.extended(
              heroTag: 'connect-bank',
              onPressed: _working ? null : () => _connect(),
              icon: const Icon(Icons.add_link),
              label: Text(l10n.bankConnectAction),
            ),
          ],
        ],
      ),
      body: _loading
          ? ListView(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 168),
              children: [FinListSkeleton(rows: 4)],
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 168),
                children: [
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.shield_outlined),
                      title: Text(l10n.bankSecureTitle),
                      subtitle: Text(l10n.bankSecureDetail),
                    ),
                  ),
                  if (_error != null)
                    Card(
                      color: Theme.of(context).colorScheme.errorContainer,
                      child: ListTile(
                        leading: const Icon(Icons.error_outline),
                        title: Text(_error!),
                        trailing: IconButton(
                            onPressed: _load, icon: const Icon(Icons.refresh)),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 16, 4, 6),
                    child: Text(l10n.bankNetPositionSection),
                  ),
                  if (_accounts.isEmpty)
                    Card(
                      child: ListTile(
                        leading:
                            const Icon(Icons.account_balance_wallet_outlined),
                        title: Text(l10n.bankNoBalancesTitle),
                        subtitle: Text(l10n.bankNoBalancesDetail),
                      ),
                    ),
                  for (final account in _accounts) _accountCard(account),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 20, 4, 6),
                    child: Text(l10n.bankConnectionsSection),
                  ),
                  if (_links.isEmpty && widget.plaidLink.isSupported)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Column(children: [
                        const Icon(Icons.account_balance_outlined, size: 56),
                        const SizedBox(height: 16),
                        Text(l10n.bankNoConnectionsTitle,
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Text(l10n.bankNoConnectionsDetail,
                            textAlign: TextAlign.center),
                      ]),
                    ),
                  // Reached only by a platform without a Plaid Link bridge.
                  // Say so plainly and point at what does work, rather than
                  // leaving an empty section that looks like a load failure.
                  if (!widget.plaidLink.isSupported)
                    Card(
                      color:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      child: ListTile(
                        leading: const Icon(Icons.phonelink_off_outlined),
                        title: Text(l10n.bankPlatformUnavailableTitle),
                        subtitle: Text(l10n.bankPlatformUnavailableDetail),
                        isThreeLine: true,
                      ),
                    ),
                  for (final link in _links) _connectionCard(link),
                ],
              ),
            ),
    );
  }

  Widget _accountCard(Account account) => Card(
        child: ListTile(
          leading: CircleAvatar(
            child: Icon(account.type == 'loan'
                ? Icons.request_quote_outlined
                : account.type == 'investment'
                    ? Icons.trending_up
                    : Icons.account_balance_wallet_outlined),
          ),
          title: Text(account.name),
          subtitle: Text(account.isManual
              ? _l10n.bankManualAccountSubtitle(
                  _typeLabel(account.type), account.currency)
              : _l10n.bankLinkedAccountSubtitle(
                  _typeLabel(account.type), account.mask)),
          trailing: account.isManual
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(account.balanceFormatted),
                    PopupMenuButton<String>(
                      tooltip: _l10n.bankManualActionsTooltip,
                      onSelected: (value) {
                        if (value == 'edit') _editManual(account);
                        if (value == 'remove') _removeManual(account);
                      },
                      itemBuilder: (_) => [
                        PopupMenuItem(
                            value: 'edit',
                            child: Text(_l10n.bankEditBalanceAction)),
                        PopupMenuItem(
                            value: 'remove',
                            child: Text(_l10n.bankRemoveAccountAction)),
                      ],
                    ),
                  ],
                )
              : Text(account.balanceFormatted),
        ),
      );

  String _typeLabel(String type) => switch (type) {
        'credit_card' => _l10n.bankTypeCreditCard,
        'checking' => _l10n.bankTypeChecking,
        'savings' => _l10n.bankTypeSavings,
        'investment' => _l10n.bankTypeInvestment,
        'loan' => _l10n.bankTypeLoan,
        'cash' => _l10n.bankTypeCash,
        _ => type,
      };

  Widget _connectionCard(BankLink link) => Card(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Column(
            children: [
              ListTile(
                leading: const CircleAvatar(child: Icon(Icons.account_balance)),
                title: Text(link.institutionName),
                subtitle: Text(_statusText(link)),
                trailing: link.needsReconnect
                    ? FilledButton(
                        onPressed: _working ? null : () => _connect(link),
                        child: Text(_l10n.bankReconnectAction))
                    : IconButton(
                        onPressed: _working ? null : () => _sync(link),
                        icon: const Icon(Icons.sync),
                        tooltip: _l10n.bankSyncNowTooltip),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _working ? null : () => _disconnect(link),
                  icon: const Icon(Icons.link_off, size: 18),
                  label: Text(_l10n.bankDisconnectAction),
                ),
              ),
            ],
          ),
        ),
      );

  String _statusText(BankLink link) {
    if (link.status == 'revoked') return _l10n.bankAccessRevokedStatus;
    if (link.needsReconnect) return _l10n.bankSignInNeedsAttention;
    if (link.status == 'syncing') return _l10n.bankSyncingStatus;
    if (link.status == 'error') {
      return link.errorCode == null
          ? _l10n.bankSyncError
          : _l10n.bankSyncErrorWithCode(link.errorCode!);
    }
    final synced = link.lastSyncedAt;
    return synced == null
        ? _l10n.bankConnectedStatus
        : _l10n.bankLastSynced(synced.substring(0, 10));
  }
}
