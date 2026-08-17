import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/client.dart';
import '../models/models.dart';

/// Check an account against a statement.
///
/// The flow is deliberately preview-then-record. Seeing the derived balance
/// before committing is what makes a difference informative: the user can spot a
/// mistyped figure without leaving a speculative row in the audit trail.
class ReconciliationScreen extends StatefulWidget {
  const ReconciliationScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<ReconciliationScreen> createState() => _ReconciliationScreenState();
}

class _ReconciliationScreenState extends State<ReconciliationScreen> {
  List<ReconciliationSummary> _accounts = const [];
  List<Reconciliation> _history = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _error = null);
    try {
      final accounts = await widget.api.reconciliationSummary();
      final history = await widget.api.reconciliations();
      if (mounted) {
        setState(() {
          _accounts = accounts;
          _history = history;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCheckSheet(ReconciliationSummary account) async {
    final recorded = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CheckBalanceSheet(api: widget.api, account: account),
    );

    if (recorded == true) {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Balance check saved.')),
        );
      }
    }
  }

  Future<void> _withdraw(Reconciliation row) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Withdraw this check?'),
        content: const Text(
          'It stays in your history marked as withdrawn, so the record of what '
          'you checked and when is preserved.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await widget.api.withdrawReconciliation(row.id);
      await _load();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyErrorMessage(error))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Balance checks')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(Theme.of(context)),
      ),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return _Message(
        icon: Icons.cloud_off,
        title: "Couldn't load balance checks",
        detail: _error!,
        action: FilledButton(onPressed: _load, child: const Text('Retry')),
      );
    }

    if (_accounts.isEmpty) {
      return const _Message(
        icon: Icons.account_balance_outlined,
        title: 'No accounts yet',
        detail: 'Connect or add an account, then check it against a statement.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Text(
          'Compare an account against a statement. FINVERSE records what you '
          'saw and never changes your transactions to make the numbers agree.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),

        ..._accounts.map((account) => _AccountCard(
              account: account,
              onCheck: () => _openCheckSheet(account),
            )),

        if (_history.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text('History', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          ..._history.map((row) => _HistoryTile(
                row: row,
                onWithdraw: row.withdrawn ? null : () => _withdraw(row),
              )),
        ],
      ],
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account, required this.onCheck});

  final ReconciliationSummary account;
  final VoidCallback onCheck;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final String status;
    if (account.neverReconciled) {
      status = 'Never checked';
    } else if (account.lastDifference == 0) {
      status = 'Agreed on ${account.lastStatementDate}';
    } else {
      status = 'Off by ${account.lastDifferenceFormatted} on ${account.lastStatementDate}';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(account.accountName, style: theme.textTheme.titleSmall),
                ),
                Text(
                  account.currentBalanceFormatted,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  account.overdue ? Icons.schedule : Icons.check_circle_outline,
                  size: 15,
                  color: account.overdue
                      ? theme.colorScheme.error
                      : theme.colorScheme.primary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    status,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: account.overdue ? theme.colorScheme.error : null,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                onPressed: onCheck,
                child: const Text('Check balance'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.row, required this.onWithdraw});

  final Reconciliation row;
  final VoidCallback? onWithdraw;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        row.balanced ? Icons.check_circle : Icons.error_outline,
        color: row.balanced ? theme.colorScheme.primary : theme.colorScheme.error,
      ),
      title: Text('${row.accountName} · ${row.statementDate}'),
      subtitle: Text(
        row.balanced
            ? 'Agreed at ${row.observedFormatted}'
            : 'You saw ${row.observedFormatted}, we had ${row.computedFormatted}',
        style: theme.textTheme.bodySmall?.copyWith(
          decoration: row.withdrawn ? TextDecoration.lineThrough : null,
        ),
      ),
      trailing: onWithdraw == null
          ? Text('Withdrawn', style: theme.textTheme.labelSmall)
          : IconButton(
              icon: const Icon(Icons.undo, size: 18),
              tooltip: 'Withdraw this check',
              onPressed: onWithdraw,
            ),
    );
  }
}

/// Enter an observed balance, preview the comparison, then record it.
class _CheckBalanceSheet extends StatefulWidget {
  const _CheckBalanceSheet({required this.api, required this.account});

  final ApiClient api;
  final ReconciliationSummary account;

  @override
  State<_CheckBalanceSheet> createState() => _CheckBalanceSheetState();
}

class _CheckBalanceSheetState extends State<_CheckBalanceSheet> {
  final _amount = TextEditingController();
  final _note = TextEditingController();

  DateTime _statementDate = DateTime.now();
  ReconciliationPreview? _preview;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  String get _isoDate =>
      '${_statementDate.year.toString().padLeft(4, '0')}-'
      '${_statementDate.month.toString().padLeft(2, '0')}-'
      '${_statementDate.day.toString().padLeft(2, '0')}';

  /// Parses to minor units. Accepts a leading minus because a credit-card
  /// statement balance is money owed.
  int? _minorUnits(String input) {
    final match = RegExp(r'^(-)?(\d+)(?:[.,](\d{1,2}))?$').firstMatch(input.trim());
    if (match == null) return null;
    final whole = int.tryParse(match.group(2)!);
    if (whole == null) return null;
    final cents = int.tryParse((match.group(3) ?? '').padRight(2, '0')) ?? 0;
    final value = whole * 100 + cents;
    return match.group(1) == null ? value : -value;
  }

  Future<void> _runPreview() async {
    final observed = _minorUnits(_amount.text);
    if (observed == null) {
      setState(() => _error = 'Enter the balance as a number, for example 1050.00');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final preview = await widget.api.previewReconciliation(
        accountId: widget.account.accountId,
        statementDate: _isoDate,
        observedBalance: observed,
      );
      if (mounted) setState(() => _preview = preview);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _record() async {
    final observed = _minorUnits(_amount.text);
    if (observed == null) return;

    setState(() => _busy = true);
    try {
      await widget.api.recordReconciliation(
        accountId: widget.account.accountId,
        statementDate: _isoDate,
        observedBalance: observed,
        note: _note.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = friendlyErrorMessage(error);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final preview = _preview;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.account.accountName, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'What did the statement say?',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),

            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: const Text('Statement date'),
              subtitle: Text(_isoDate),
              trailing: const Icon(Icons.edit_calendar_outlined),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _statementDate,
                  firstDate: DateTime(2000),
                  // A statement cannot close in the future, and the API rejects
                  // it anyway — better to make it unpickable than to explain it.
                  lastDate: DateTime.now(),
                );
                if (picked != null) {
                  setState(() {
                    _statementDate = picked;
                    _preview = null;
                  });
                }
              },
            ),

            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[-0-9.,]'))],
              onChanged: (_) => setState(() => _preview = null),
              decoration: InputDecoration(
                labelText: 'Closing balance',
                helperText: 'Use a minus sign for money owed on a card',
                border: const OutlineInputBorder(),
                prefixText: '${widget.account.currency} ',
              ),
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _note,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                border: OutlineInputBorder(),
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
              ),
            ],

            if (preview != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: preview.balanced
                      ? theme.colorScheme.primaryContainer
                      : theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      preview.balanced ? 'Everything agrees' : 'Off by ${preview.differenceFormatted}',
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(preview.explanation, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 4),
                    Text(
                      'FINVERSE had ${preview.computedFormatted} on that date.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 16),
            if (preview == null)
              FilledButton(
                onPressed: _busy ? null : _runPreview,
                child: _busy
                    ? const SizedBox(
                        height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Compare'),
              )
            else
              FilledButton(
                onPressed: _busy ? null : _record,
                child: const Text('Save this check'),
              ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    required this.detail,
    this.action,
  });

  final IconData icon;
  final String title;
  final String detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 40, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(height: 12),
        Text(title, textAlign: TextAlign.center, style: theme.textTheme.titleSmall),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(detail, textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
        ),
        if (action != null) ...[
          const SizedBox(height: 16),
          Center(child: action),
        ],
      ],
    );
  }
}
