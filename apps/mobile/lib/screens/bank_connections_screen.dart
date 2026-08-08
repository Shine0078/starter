import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/client.dart';
import '../api/plaid_link.dart';
import '../models/models.dart';

class BankConnectionsScreen extends StatefulWidget {
  const BankConnectionsScreen(
      {required this.api, PlaidLink? plaidLink, super.key})
      : plaidLink = plaidLink ?? const _DefaultPlaidLink();

  final ApiClient api;
  final PlaidLink plaidLink;

  @override
  State<BankConnectionsScreen> createState() => _BankConnectionsScreenState();
}

class _DefaultPlaidLink extends PlaidLink {
  const _DefaultPlaidLink();
}

class _BankConnectionsScreenState extends State<BankConnectionsScreen> {
  List<BankLink> _links = const [];
  bool _loading = true;
  bool _working = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _recoverPlaidResult();
  }

  Future<void> _load() async {
    try {
      final links = await widget.api.bankLinks();
      if (mounted) {
        setState(() {
          _links = links;
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
      }
    } on MissingPluginException {
      // Expected in widget tests and on platforms without the Android bridge.
    }
  }

  Future<void> _connect([BankLink? existing]) async {
    if (_working) return;
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final token = await widget.api.createBankLinkToken(linkId: existing?.id);
      final result = await widget.plaidLink.open(token);
      if (!result.succeeded) {
        if (result.errorCode != null) {
          _show(result.errorMessage ?? 'Bank connection was not completed.');
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
      _show('Transactions are up to date.');
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
        title: Text('Disconnect ${link.institutionName}?'),
        content: const Text(
          'Plaid access will be revoked immediately. Transactions already imported into FINVERSE are kept so your budgets and history remain useful.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _working = true);
    try {
      await widget.api.disconnectBank(link.id);
      await _load();
      _show('Bank access revoked.');
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

  String _friendly(Object error) {
    final value = error.toString();
    if (value.contains('503')) {
      return 'Bank connections are not configured on this server yet.';
    }
    return value;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Accounts'),
          actions: [
            IconButton(
                onPressed: _working ? null : _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh'),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'connect-bank',
          onPressed: _working ? null : () => _connect(),
          icon: const Icon(Icons.add_link),
          label: const Text('Connect bank'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                  children: [
                    const Card(
                      child: ListTile(
                        leading: Icon(Icons.shield_outlined),
                        title: Text('Secure bank connection'),
                        subtitle: Text(
                            'FINVERSE never sees or stores your bank password. Plaid handles sign-in and consent.'),
                      ),
                    ),
                    if (_error != null)
                      Card(
                        color: Theme.of(context).colorScheme.errorContainer,
                        child: ListTile(
                          leading: const Icon(Icons.error_outline),
                          title: Text(_error!),
                          trailing: IconButton(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh)),
                        ),
                      ),
                    if (_links.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 48),
                        child: Column(children: [
                          Icon(Icons.account_balance_outlined, size: 56),
                          SizedBox(height: 16),
                          Text('No bank connected yet',
                              style: TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w600)),
                          SizedBox(height: 8),
                          Text(
                              'Connect an account to replace sample data with your real balances and transactions.',
                              textAlign: TextAlign.center),
                        ]),
                      ),
                    for (final link in _links) _connectionCard(link),
                  ],
                ),
              ),
      );

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
                        child: const Text('Reconnect'))
                    : IconButton(
                        onPressed: _working ? null : () => _sync(link),
                        icon: const Icon(Icons.sync),
                        tooltip: 'Sync now'),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _working ? null : () => _disconnect(link),
                  icon: const Icon(Icons.link_off, size: 18),
                  label: const Text('Disconnect'),
                ),
              ),
            ],
          ),
        ),
      );

  String _statusText(BankLink link) {
    if (link.needsReconnect) return 'Sign-in needs attention';
    if (link.status == 'syncing') return 'Syncing…';
    if (link.status == 'error') {
      return 'Sync error${link.errorCode == null ? '' : ' · ${link.errorCode}'}';
    }
    final synced = link.lastSyncedAt;
    return synced == null
        ? 'Connected'
        : 'Last synced ${synced.substring(0, 10)}';
  }
}
