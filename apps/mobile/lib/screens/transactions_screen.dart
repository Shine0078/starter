import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';
import '../widgets/transaction_tile.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  final _search = TextEditingController();
  List<Transaction> _rows = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await widget.api
          .transactions(limit: 200, search: _search.text.trim());
      if (mounted) setState(() => _rows = rows);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Transactions')),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: SearchBar(
                controller: _search,
                hintText: 'Search merchant or description',
                leading: const Icon(Icons.search),
                trailing: [
                  IconButton(
                    tooltip: 'Search',
                    onPressed: _load,
                    icon: const Icon(Icons.arrow_forward),
                  ),
                ],
                onSubmitted: (_) => _load(),
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      );

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
          child: FilledButton(onPressed: _load, child: const Text('Retry')));
    }
    if (_rows.isEmpty) {
      return const Center(child: Text('No matching transactions.'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _rows.length,
        itemBuilder: (context, index) {
          final row = _rows[index];
          return TransactionTile(
            transaction: row,
            onRecategorize: (slug) async {
              await widget.api.recategorize(row.id, slug);
              await _load();
            },
          );
        },
      ),
    );
  }
}
