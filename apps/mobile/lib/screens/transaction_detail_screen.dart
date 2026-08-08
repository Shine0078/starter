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
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _category = widget.transaction.categorySlug;
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
                category.parent != null || category.slug == _category)
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
                _detail('Recurring', transaction.isRecurring ? 'Yes' : 'No'),
                _detail('Account reference', transaction.accountId),
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

  String _categoryExplanation(Transaction transaction) {
    if (transaction.isUserSet) return 'Chosen by you.';
    if (transaction.needsReview) return 'FINVERSE needs your review.';
    final percent = (transaction.categoryConfidence * 100).round();
    return 'Suggested by ${transaction.categorySource.replaceAll('_', ' ')} • $percent% confidence.';
  }
}
