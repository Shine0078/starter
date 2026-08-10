import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

/// Lets users see and remove the durable rules created by category corrections.
/// Rules remain server-owned so the same decisions apply on every device.
class CategorizationRulesScreen extends StatefulWidget {
  const CategorizationRulesScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<CategorizationRulesScreen> createState() =>
      _CategorizationRulesScreenState();
}

class _CategorizationRulesScreenState
    extends State<CategorizationRulesScreen> {
  List<CategorizationRule> _rules = const [];
  Map<String, String> _categoryNames = const {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await Future.wait<dynamic>([
        widget.api.categorizationRules(),
        widget.api.categories(),
      ]);
      if (!mounted) return;
      final categories = result[1] as List<CategoryDefinition>;
      setState(() {
        _rules = result[0] as List<CategorizationRule>;
        _categoryNames = {
          for (final category in categories) category.slug: category.name,
        };
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _delete(CategorizationRule rule) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this rule?'),
        content: Text(
          'Future matching transactions will use the normal categorization '
          'pipeline again. Existing transaction choices stay unchanged.\n\n'
          '“${rule.pattern}” → ${_categoryNames[rule.categorySlug] ?? rule.categorySlug}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep rule'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await widget.api.deleteCategorizationRule(rule.id);
      if (!mounted) return;
      setState(() => _rules = _rules.where((item) => item.id != rule.id).toList());
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Rule deleted.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not delete rule: $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Categorization rules')),
        body: _body(),
      );

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: FilledButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh),
          label: const Text('Retry'),
        ),
      );
    }
    if (_rules.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          children: const [
            Icon(Icons.auto_fix_high_outlined, size: 48),
            SizedBox(height: 16),
            Text(
              'No saved rules yet',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            SizedBox(height: 8),
            Text(
              'When you correct a transaction category, FINVERSE can remember '
              'that choice for matching merchants.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          const Text(
            'These rules apply to your account on every device. Deleting a '
            'rule does not rewrite the original bank record or existing edits.',
          ),
          const SizedBox(height: 12),
          ..._rules.map(
            (rule) => Card(
              child: ListTile(
                leading: const Icon(Icons.auto_fix_high_outlined),
                title: Text(rule.pattern),
                subtitle: Text(
                  '${rule.matchType} → ${_categoryNames[rule.categorySlug] ?? rule.categorySlug}',
                ),
                trailing: IconButton(
                  tooltip: 'Delete rule',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _delete(rule),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
