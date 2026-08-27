import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

/// Review-first manual statement ingestion. The server is authoritative for
/// parsing, categorization, duplicate detection, and approval; this screen
/// only presents staged rows and sends explicit user decisions.
class StatementImportScreen extends StatefulWidget {
  const StatementImportScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<StatementImportScreen> createState() => _StatementImportScreenState();
}

class _StatementImportScreenState extends State<StatementImportScreen> {
  List<Account> _accounts = const [];
  List<StatementImport> _history = const [];
  StatementImportDetail? _detail;
  StatementSummary? _summary;
  String? _accountId;
  bool _working = false;
  String? _error;
  final Set<String> _selected = <String>{};

  @override
  void initState() {
    super.initState();
    _loadAccounts();
  }

  Future<void> _loadAccounts() async {
    try {
      final accounts = await widget.api.accounts();
      final history = await widget.api.statementImports();
      if (!mounted) return;
      setState(() {
        _accounts = accounts;
        _history = history;
        _accountId ??= accounts.isEmpty ? null : accounts.first.id;
      });
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    }
  }

  Future<void> _openExisting(StatementImport item) async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final detail = await widget.api.statementImport(item.id);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _accountId = item.accountId;
      });
      await _refreshSummary(item.id);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _pickAndAnalyze() async {
    final accountId = _accountId;
    if (accountId == null) return;
    final file = await openFile(
      acceptedTypeGroups: const [
        XTypeGroup(
          label: 'Financial statements',
          extensions: [
            'csv',
            'xlsx',
            'pdf',
            'png',
            'jpg',
            'jpeg',
            'webp',
            'tiff',
            'bmp'
          ],
        ),
      ],
    );
    if (file == null) return;
    setState(() {
      _working = true;
      _error = null;
      _detail = null;
      _summary = null;
      _selected.clear();
    });
    try {
      final bytes = await file.readAsBytes();
      final mime = _mimeFor(file.name);
      final detail = await widget.api.createStatementImport(
        accountId: accountId,
        filename: file.name,
        mimeType: mime,
        bytes: bytes,
      );
      if (mounted) setState(() => _detail = detail);
      if (mounted) {
        try {
          final summary =
              await widget.api.statementImportSummary(detail.statement.id);
          if (mounted) setState(() => _summary = summary);
        } catch (_) {
          // The row review remains usable if a summary request is unavailable.
        }
      }
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _decision(StatementRow row, String decision) async {
    final detail = _detail;
    if (detail == null) return;
    try {
      await widget.api.editStatementRow(
        detail.statement.id,
        row.id,
        {'decision': decision},
      );
      final fresh = await widget.api.statementImport(detail.statement.id);
      if (!mounted) return;
      setState(() {
        _detail = fresh;
      });
      await _refreshSummary(fresh.statement.id);
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _editCategory(StatementRow row) async {
    final detail = _detail;
    if (detail == null) return;
    const categories = [
      'unknown',
      'rent',
      'utilities',
      'groceries',
      'restaurants',
      'transportation',
      'shopping',
      'subscriptions',
      'healthcare',
      'entertainment',
      'loan_payment',
      'transfer',
      'fees',
      'savings',
      'investments',
      'income',
      'refunds'
    ];
    final category = await showDialog<String>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('Choose category'),
        children: categories
            .map((value) => SimpleDialogOption(
                  onPressed: () => Navigator.of(dialogContext).pop(value),
                  child: Text(value.replaceAll('_', ' ')),
                ))
            .toList(),
      ),
    );
    if (category == null) return;
    try {
      await widget.api.editStatementRow(detail.statement.id, row.id,
          {'categorySlug': category, 'decision': 'include'});
      final fresh = await widget.api.statementImport(detail.statement.id);
      if (!mounted) return;
      setState(() => _detail = fresh);
      await _refreshSummary(fresh.statement.id);
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _editRow(StatementRow row) async {
    final detail = _detail;
    if (detail == null) return;
    final date = TextEditingController(text: row.postedAt ?? '');
    final description = TextEditingController(text: row.description);
    final merchant = TextEditingController(text: row.merchant ?? '');
    final amount = TextEditingController(text: row.amount?.toString() ?? '');
    final values = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit transaction'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: date,
                decoration:
                    const InputDecoration(labelText: 'Date (YYYY-MM-DD)')),
            TextField(
                controller: description,
                decoration: const InputDecoration(labelText: 'Description')),
            TextField(
                controller: merchant,
                decoration:
                    const InputDecoration(labelText: 'Merchant (optional)')),
            TextField(
                controller: amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Amount (minor units; negative is debit)')),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop({
                    'postedAt': date.text,
                    'description': description.text,
                    'merchant': merchant.text,
                    'amount': amount.text,
                  }),
              child: const Text('Save')),
        ],
      ),
    );
    if (values == null) return;
    final parsedAmount = int.tryParse(values['amount'] ?? '');
    if (parsedAmount == null || parsedAmount == 0) {
      _showMessage('Enter a non-zero amount in minor units.');
      return;
    }
    try {
      await widget.api.editStatementRow(detail.statement.id, row.id, {
        'postedAt': values['postedAt'],
        'description': values['description'],
        'merchant': (values['merchant'] ?? '').trim().isEmpty
            ? null
            : values['merchant'],
        'amount': parsedAmount,
      });
      final fresh = await widget.api.statementImport(detail.statement.id);
      if (!mounted) return;
      setState(() => _detail = fresh);
      await _refreshSummary(fresh.statement.id);
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _split(StatementRow row) async {
    if (row.amount == null || _detail == null) return;
    final first =
        TextEditingController(text: ((row.amount! / 2).round()).toString());
    final second = TextEditingController(
        text: (row.amount! - (row.amount! / 2).round()).toString());
    final values = await showDialog<List<int>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Split transaction'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
              controller: first,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'First amount (minor units)')),
          TextField(
              controller: second,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'Second amount (minor units)')),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop([
                    int.tryParse(first.text) ?? 0,
                    int.tryParse(second.text) ?? 0
                  ]),
              child: const Text('Split')),
        ],
      ),
    );
    if (values == null || values.length != 2) return;
    try {
      await widget.api.splitStatementRow(
          _detail!.statement.id,
          row.id,
          values
              .map((amount) =>
                  {'amount': amount, 'categorySlug': row.categorySlug})
              .toList());
      final fresh = await widget.api.statementImport(_detail!.statement.id);
      if (mounted) setState(() => _detail = fresh);
      await _refreshSummary(fresh.statement.id);
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _merge() async {
    if (_selected.length < 2 || _detail == null) return;
    try {
      await widget.api
          .mergeStatementRows(_detail!.statement.id, _selected.toList());
      final fresh = await widget.api.statementImport(_detail!.statement.id);
      if (mounted) {
        setState(() {
          _detail = fresh;
          _selected.clear();
        });
      }
      await _refreshSummary(fresh.statement.id);
    } catch (error) {
      if (mounted) _showError(error);
    }
  }

  Future<void> _approve() async {
    final detail = _detail;
    if (detail == null) return;
    setState(() => _working = true);
    try {
      final approved =
          await widget.api.approveStatementImport(detail.statement.id);
      if (mounted) {
        setState(() => _detail =
            StatementImportDetail(statement: approved, rows: detail.rows));
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _deleteSource() async {
    final detail = _detail;
    if (detail == null || detail.statement.sourceDeletedAt != null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete original statement?'),
        content: const Text(
            'The encrypted original file will be permanently removed. Approved transactions and their audit history will remain.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Keep file')),
          FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Delete file')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _working = true);
    try {
      await widget.api.deleteStatementSource(detail.statement.id);
      final fresh = await widget.api.statementImport(detail.statement.id);
      if (mounted) {
        setState(() => _detail = fresh);
        _showMessage(
            'Original statement deleted. Approved transactions were kept.');
      }
    } catch (error) {
      if (mounted) _showError(error);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _showError(Object error) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));

  void _showMessage(String message) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(message)));

  Future<void> _refreshSummary(String id) async {
    try {
      final summary = await widget.api.statementImportSummary(id);
      if (mounted) setState(() => _summary = summary);
    } catch (_) {
      // The review remains useful if this optional aggregate is unavailable.
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    return Scaffold(
      appBar: AppBar(title: const Text('Manual statement import')),
      body: RefreshIndicator(
        onRefresh: _loadAccounts,
        child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              const Text(
                  'Upload a statement, review every uncertain row, then approve it into your transactions.'),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                  initialValue: _accountId,
                  decoration: const InputDecoration(labelText: 'Account'),
                  items: _accounts
                      .map((account) => DropdownMenuItem(
                          value: account.id,
                          child: Text('${account.name}  ••${account.mask}')))
                      .toList(),
                  onChanged: _working
                      ? null
                      : (value) => setState(() => _accountId = value)),
              const SizedBox(height: 12),
              FilledButton.icon(
                  onPressed:
                      _working || _accountId == null ? null : _pickAndAnalyze,
                  icon: const Icon(Icons.upload_file),
                  label: Text(_working ? 'Processing…' : 'Choose statement')),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error))),
              if (detail == null && _history.isNotEmpty) ...[
                const SizedBox(height: 24),
                Text('Previous imports',
                    style: Theme.of(context).textTheme.titleMedium),
                ..._history.map((item) => Card(
                      child: ListTile(
                        leading: Icon(item.status == 'approved'
                            ? Icons.check_circle_outline
                            : Icons.rate_review_outlined),
                        title: Text(item.filename,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                            '${item.rowsNeedsReview} need review · ${item.status}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: _working ? null : () => _openExisting(item),
                      ),
                    )),
              ],
              if (detail != null) ...[
                const SizedBox(height: 24),
                Text(detail.statement.filename,
                    style: Theme.of(context).textTheme.titleMedium),
                Text(
                    '${detail.statement.rowsTotal} rows · ${detail.statement.rowsNeedsReview} need review',
                    style: Theme.of(context).textTheme.bodySmall),
                if (_summary != null) _summaryView(_summary!),
                const SizedBox(height: 8),
                if (_selected.length >= 2)
                  Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonalIcon(
                          onPressed: _merge,
                          icon: const Icon(Icons.merge_type),
                          label: const Text('Merge selected'))),
                ...detail.rows.map(_rowTile),
                const SizedBox(height: 12),
                FilledButton.icon(
                    onPressed: _working ||
                            detail.statement.rowsNeedsReview > 0 ||
                            detail.statement.status != 'ready'
                        ? null
                        : _approve,
                    icon: const Icon(Icons.check),
                    label: Text(detail.statement.status == 'approved'
                        ? 'Approved'
                        : 'Approve transactions')),
                if (detail.statement.status == 'approved' &&
                    detail.statement.sourceDeletedAt == null) ...[
                  Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                          'The original file can be removed while approved transactions remain in your ledger.',
                          style: Theme.of(context).textTheme.bodySmall)),
                  Align(
                      alignment: Alignment.centerLeft,
                      child: OutlinedButton.icon(
                          onPressed: _working ? null : _deleteSource,
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Delete original file'))),
                ],
                if (detail.statement.sourceDeletedAt != null)
                  Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                          'Original file deleted; approved transactions remain.',
                          style: Theme.of(context).textTheme.bodySmall)),
              ],
            ]),
      ),
    );
  }

  Widget _rowTile(StatementRow row) {
    final theme = Theme.of(context);
    final flagged = row.decision == 'needs_review';
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: ListTile(
        leading: Checkbox(
            value: _selected.contains(row.id),
            onChanged: row.decision == 'exclude'
                ? null
                : (checked) => setState(() => checked == true
                    ? _selected.add(row.id)
                    : _selected.remove(row.id))),
        title:
            Text(row.description, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text(
            '${row.postedAt ?? 'Date unclear'} · ${row.amount ?? 'Amount unclear'} ${row.currency} · ${row.direction}\n${row.merchant == null || row.merchant!.isEmpty ? row.description : row.merchant}\n${row.categorySlug} · ${(row.categoryConfidence * 100).round()}% confidence${row.flags.isEmpty ? '' : '\n${row.flags.join(', ')}'}',
            style: TextStyle(color: flagged ? theme.colorScheme.error : null)),
        isThreeLine: true,
        trailing: PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'edit') _editRow(row);
              if (value == 'category') _editCategory(row);
              if (value == 'include' || value == 'exclude') {
                _decision(row, value);
              }
              if (value == 'split') _split(row);
            },
            itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Edit details')),
                  PopupMenuItem(value: 'include', child: Text('Include')),
                  PopupMenuItem(value: 'exclude', child: Text('Exclude')),
                  PopupMenuItem(value: 'category', child: Text('Recategorize')),
                  PopupMenuItem(value: 'split', child: Text('Split'))
                ]),
      ),
    );
  }

  Widget _summaryView(StatementSummary summary) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          Chip(label: Text('Income ${summary.income} ${summary.currency}')),
          Chip(label: Text('Expenses ${summary.expenses} ${summary.currency}')),
          Chip(label: Text('Savings ${summary.savings} ${summary.currency}')),
          Chip(label: Text('${summary.recurringCount} recurring')),
          if (summary.unusualCount > 0)
            Chip(label: Text('${summary.unusualCount} unusual')),
          if (summary.duplicateCount > 0)
            Chip(label: Text('${summary.duplicateCount} possible duplicates')),
        ]),
      );
}

String _mimeFor(String name) {
  switch (name.toLowerCase().split('.').last) {
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'tiff':
      return 'image/tiff';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}
