import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

class TransactionDetailScreen extends StatefulWidget {
  const TransactionDetailScreen({
    required this.api,
    required this.transaction,
    super.key,
  });

  final ApiClient api;
  final Transaction transaction;

  @override
  State<TransactionDetailScreen> createState() =>
      _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends State<TransactionDetailScreen> {
  List<CategoryDefinition> _categories = const [];
  late String _category;
  late String _merchantOverride;
  late String _note;
  late bool _excludedFromAnalytics;
  late bool _isRecurring;
  late bool? _recurringOverride;
  late bool _duplicateReported;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _category = widget.transaction.categorySlug;
    _merchantOverride = widget.transaction.merchantOverride ?? '';
    _note = widget.transaction.note ?? '';
    _excludedFromAnalytics = widget.transaction.excludedFromAnalytics;
    _isRecurring = widget.transaction.isRecurring;
    _recurringOverride = widget.transaction.recurringOverride;
    _duplicateReported = widget.transaction.duplicateReported;
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    widget.api.resetOfflineStatus();
    try {
      final categories = await widget.api.categories();
      if (!mounted) return;
      setState(() {
        _categories = categories
            .where((category) =>
                category.parent != null ||
                category.slug == _category ||
                category.slug == 'transfer')
            .toList()
          ..sort((a, b) => a.name.compareTo(b.name));
      });
    } catch (_) {
      // Details remain useful if the static category reference cannot load.
    }
  }

  Future<void> _saveCategory(String slug) async {
    final previous = _category;
    setState(() {
      _category = slug;
      _saving = true;
    });
    try {
      final message =
          await widget.api.recategorize(widget.transaction.id, slug);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (!mounted) return;
      setState(() => _category = previous);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editText({required bool note}) async {
    final controller =
        TextEditingController(text: note ? _note : _merchantOverride);
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(note ? 'Add a note' : 'Rename merchant'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: note ? 2000 : 120,
          maxLines: note ? 5 : 1,
          decoration: InputDecoration(
            hintText: note
                ? 'Only you can see this note'
                : 'Your local merchant name',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (!mounted || value == null) return;
    setState(() => _saving = true);
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        merchantOverride: note ? null : value,
        note: note ? value : null,
      );
      if (!mounted) return;
      setState(() {
        _merchantOverride = updated.merchantOverride ?? '';
        _note = updated.note ?? '';
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleExcluded(bool value) async {
    final previous = _excludedFromAnalytics;
    setState(() {
      _excludedFromAnalytics = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        excludedFromAnalytics: value,
      );
      if (mounted) {
        setState(() => _excludedFromAnalytics = updated.excludedFromAnalytics);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _excludedFromAnalytics = previous);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleRecurring(bool value) async {
    final previous = _isRecurring;
    final previousOverride = _recurringOverride;
    setState(() {
      _isRecurring = value;
      _recurringOverride = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        isRecurring: value,
      );
      if (mounted) {
        setState(() {
          _isRecurring = updated.isRecurring;
          _recurringOverride = updated.recurringOverride;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _isRecurring = previous;
          _recurringOverride = previousOverride;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleDuplicateReported(bool value) async {
    final previous = _duplicateReported;
    setState(() {
      _duplicateReported = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        duplicateReported: value,
      );
      if (mounted) setState(() => _duplicateReported = updated.duplicateReported);
    } catch (error) {
      if (mounted) {
        setState(() => _duplicateReported = previous);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final transaction = widget.transaction;
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction details')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 28,
                  child: Icon(transaction.amount < 0
                      ? Icons.shopping_bag_outlined
                      : Icons.south_west),
                ),
                const SizedBox(height: 12),
                Text(
                  transaction.displayName,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  transaction.amountFormatted,
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text('${transaction.postedAt} • ${transaction.currency}'),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Category',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  if (_categories.isEmpty)
                    Text(_category.replaceAll('_', ' '))
                  else
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                      ),
                      items: _categories
                          .map((category) => DropdownMenuItem(
                                value: category.slug,
                                child: Text(category.name),
                              ))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (value) {
                              if (value != null && value != _category) {
                                _saveCategory(value);
                              }
                            },
                    ),
                  const SizedBox(height: 8),
                  Text(_categoryExplanation(transaction)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                _detail('Bank description', transaction.rawDescriptor),
                _detail('Normalized name', transaction.normalizedDescriptor),
                _detail('Status', transaction.pending ? 'Pending' : 'Posted'),
                _detail(
                  'Recurring',
                  _isRecurring
                      ? (_recurringOverride == null
                          ? 'Yes · detected from history'
                          : 'Yes · marked by you')
                      : (_recurringOverride == null
                          ? 'No · not detected'
                          : 'No · marked by you'),
                ),
                _detail('Account reference', transaction.accountId),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.storefront_outlined),
                  title: Text(_merchantOverride.isEmpty
                      ? 'Rename merchant'
                      : _merchantOverride),
                  subtitle: Text(_merchantOverride.isEmpty
                      ? 'Use a name that makes sense to you'
                      : 'Local name; bank description is preserved below'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _saving ? null : () => _editText(note: false),
                ),
                ListTile(
                  leading: const Icon(Icons.notes_outlined),
                  title: Text(_note.isEmpty ? 'Add a note' : 'Edit note'),
                  subtitle: Text(_note.isEmpty
                      ? 'Private context for this transaction'
                      : _note),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _saving ? null : () => _editText(note: true),
                ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.autorenew),
                  title: const Text('Mark as recurring'),
                  subtitle: Text(_recurringOverride == null
                      ? 'Override the history-based detector for this transaction'
                      : 'Your choice is kept across future bank syncs'),
                  value: _isRecurring,
                  onChanged: _saving ? null : _toggleRecurring,
                ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.report_gmailerrorred_outlined),
                  title: const Text('Flag possible duplicate'),
                  subtitle: Text(_duplicateReported
                      ? 'Kept as a review marker; the transaction remains in your ledger'
                      : 'Mark this charge for your own follow-up'),
                  value: _duplicateReported,
                  onChanged: _saving ? null : _toggleDuplicateReported,
                ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.visibility_off_outlined),
                  title: const Text('Exclude from analytics'),
                  subtitle: const Text(
                    'Keep the transaction, but omit it from totals and alerts',
                  ),
                  value: _excludedFromAnalytics,
                  onChanged: _saving ? null : _toggleExcluded,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Changing the category also teaches FINVERSE how to classify matching transactions from this merchant.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _detail(String label, String value) => ListTile(
        title: Text(label),
        subtitle: SelectableText(value.isEmpty ? 'Unavailable' : value),
      );

  /// Every category must be able to say why it is what it is (ADR-0004), and
  /// "suggested by transfer pairing" is provenance, not an explanation.
  String _categoryExplanation(Transaction transaction) {
    if (transaction.isUserSet) return 'Chosen by you.';
    if (transaction.needsReview) return 'FINVERSE needs your review.';

    if (transaction.categorySource == 'transfer_pairing') {
      return 'Matched to the opposite side of this amount in another of your '
          'accounts, so it is money you moved rather than income or spending. '
          'It is left out of your totals.';
    }

    final percent = (transaction.categoryConfidence * 100).round();
    if (transaction.categorySource == 'lexicon') {
      return 'Recognised from the merchant name • $percent% confidence.';
    }
    return 'Suggested by ${transaction.categorySource.replaceAll('_', ' ')} • $percent% confidence.';
  }
}
