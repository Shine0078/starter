import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/offline_cache.dart';
import '../l10n/app_localizations.dart';

class OfflineConflictScreen extends StatefulWidget {
  const OfflineConflictScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<OfflineConflictScreen> createState() => _OfflineConflictScreenState();
}

class _OfflineConflictScreenState extends State<OfflineConflictScreen> {
  List<QueuedApiMutation> _pending = const [];
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _loadPending();
  }

  Future<void> _loadPending() async {
    final owner = widget.api.sessionUserId;
    if (owner == null) {
      if (mounted) setState(() => _pending = const []);
      return;
    }
    final pending = await widget.api.offlineCache.pendingMutations(owner);
    if (mounted) setState(() => _pending = pending);
  }

  Future<void> _retry() async {
    setState(() => _busy = true);
    try {
      await widget.api.replayOfflineMutations();
      await _loadPending();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rejected = widget.api.rejectedMutations;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.offlineConflictTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (_pending.isNotEmpty) ...[
            Text(l10n.offlineConflictPendingTitle,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final mutation in _pending)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.cloud_upload_outlined),
                  title: Text(mutation.path),
                  subtitle: Text(mutation.method),
                ),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _busy ? null : _retry,
              child: Text(l10n.offlineConflictRetry),
            ),
            const SizedBox(height: 24),
          ],
          Text(l10n.offlineConflictRejectedTitle,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (rejected.isEmpty)
            Text(l10n.offlineConflictEmpty)
          else
            for (final mutation in rejected)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.error_outline),
                  title: Text(mutation.path),
                  subtitle: Text(
                    '${mutation.toString()}\n${l10n.offlineConflictStatus(mutation.statusCode)}',
                  ),
                  isThreeLine: true,
                  trailing: TextButton(
                    onPressed: () {
                      widget.api.dismissRejectedMutation(mutation);
                      setState(() {});
                    },
                    child: Text(l10n.offlineConflictDismissOne),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
