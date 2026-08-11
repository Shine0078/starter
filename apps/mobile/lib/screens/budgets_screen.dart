import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';
import '../widgets/budget_tile.dart';

class BudgetsScreen extends StatefulWidget {
  const BudgetsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<BudgetsScreen> createState() => _BudgetsScreenState();
}

class _BudgetsScreenState extends State<BudgetsScreen> {
  static const _categories = [
    'groceries',
    'restaurants',
    'coffee',
    'food_delivery',
    'fuel',
    'rideshare',
    'shopping',
    'rent',
    'utilities',
    'streaming',
    'fitness',
    'healthcare',
    'travel',
    'entertainment',
  ];

  List<BudgetProgress> _rows = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.api.dataRevision.addListener(_onDataChanged);
    _load();
  }

  @override
  void dispose() {
    widget.api.dataRevision.removeListener(_onDataChanged);
    super.dispose();
  }

  void _onDataChanged() {
    if (!mounted || _loading) return;
    _load();
  }

  Future<void> _load() async {
    widget.api.resetOfflineStatus();
    if (mounted) setState(() => _error = null);
    try {
      final rows = await widget.api.budgetProgress();
      if (mounted) setState(() => _rows = rows);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    var category = _categories.first;
    final amount = TextEditingController();
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Create monthly budget'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: _categories
                    .map((slug) => DropdownMenuItem(
                          value: slug,
                          child: Text(slug.replaceAll('_', ' ')),
                        ))
                    .toList(),
                onChanged: (value) =>
                    setDialogState(() => category = value ?? category),
              ),
              TextField(
                controller: amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration:
                    const InputDecoration(labelText: 'Monthly limit (dollars)'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext)
                  .pop((category, amount.text.trim())),
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
    amount.dispose();
    if (result == null || !mounted) return;

    final parsed = _minorUnits(result.$2);
    if (parsed == null || parsed <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive dollar amount.')),
      );
      return;
    }
    try {
      await widget.api.createBudget(result.$1, parsed);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save budget: $error')),
      );
    }
  }

  int? _minorUnits(String input) {
    final match = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(input);
    if (match == null) return null;
    final whole = int.tryParse(match.group(1)!);
    final fraction = (match.group(2) ?? '').padRight(2, '0');
    final cents = int.tryParse(fraction.isEmpty ? '0' : fraction);
    if (whole == null || cents == null) return null;
    return whole * 100 + cents;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Budgets')),
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'add-budget',
          onPressed: _create,
          icon: const Icon(Icons.add),
          label: const Text('New budget'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: FilledButton(
                      onPressed: _load,
                      child: const Text('Retry'),
                    ),
                  )
                : _rows.isEmpty
                    ? const Center(
                        child:
                            Text('Create a budget to start tracking progress.'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                          children: _rows.map((row) {
                            return Dismissible(
                              key: ValueKey(row.budgetId),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 24),
                                color: Theme.of(context)
                                    .colorScheme
                                    .errorContainer,
                                child: const Icon(Icons.delete_outline),
                              ),
                              confirmDismiss: (_) async {
                                final confirmed = await showDialog<bool>(
                                      context: context,
                                      builder: (dialogContext) => AlertDialog(
                                        title:
                                            const Text('Remove this budget?'),
                                        content: Text(
                                            'Stop tracking ${row.categoryName}?'),
                                        actions: [
                                          TextButton(
                                            onPressed: () =>
                                                Navigator.of(dialogContext)
                                                    .pop(false),
                                            child: const Text('Cancel'),
                                          ),
                                          FilledButton(
                                            onPressed: () =>
                                                Navigator.of(dialogContext)
                                                    .pop(true),
                                            child: const Text('Remove'),
                                          ),
                                        ],
                                      ),
                                    ) ??
                                    false;
                                if (!confirmed) return false;
                                try {
                                  await widget.api.deleteBudget(row.budgetId);
                                  return true;
                                } catch (error) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                            'Could not remove budget: $error'),
                                      ),
                                    );
                                  }
                                  return false;
                                }
                              },
                              child: BudgetTile(progress: row),
                            );
                          }).toList(),
                        ),
                      ),
      );
}
