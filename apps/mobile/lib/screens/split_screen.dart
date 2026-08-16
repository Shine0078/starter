import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';

/// Shared-expense ("split affairs") hub: groups you belong to, and the detail
/// view for a group — members, who owes whom, and the expenses behind it.
class SplitScreen extends StatefulWidget {
  const SplitScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<SplitScreen> createState() => _SplitScreenState();
}

class _SplitScreenState extends State<SplitScreen> {
  var _loading = true;
  String? _error;
  List<SplitGroup> _groups = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final groups = await widget.api.splitGroups();
      if (!mounted) return;
      setState(() {
        _groups = groups;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  Future<void> _createGroup() async {
    final l10n = AppLocalizations.of(context);
    final name = TextEditingController();
    final submitted = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.splitNewGroupTitle),
        content: TextField(
          controller: name,
          autofocus: true,
          decoration: InputDecoration(
            labelText: l10n.splitGroupNameLabel,
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(name.text.trim()),
            child: Text(l10n.commonCreate),
          ),
        ],
      ),
    );
    name.dispose();
    if (submitted == null || submitted.isEmpty || !mounted) return;
    try {
      await widget.api.createSplitGroup(name: submitted);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.splitTitle)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createGroup,
        icon: const Icon(Icons.add),
        label: Text(l10n.splitNewGroupAction),
      ),
      body: _buildBody(l10n),
    );
  }

  Widget _buildBody(AppLocalizations l10n) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(l10n.commonRetry)),
            ],
          ),
        ),
      );
    }
    if (_groups.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.group_outlined, size: 56),
              const SizedBox(height: 16),
              Text(l10n.splitEmptyTitle,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(l10n.splitEmptyDetail, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      itemCount: _groups.length,
      itemBuilder: (context, index) {
        final group = _groups[index];
        return Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.group_outlined)),
            title: Text(group.name),
            subtitle: Text(group.currency),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => SplitGroupDetailScreen(api: widget.api, groupId: group.id),
            )),
          ),
        );
      },
    );
  }
}

class SplitGroupDetailScreen extends StatefulWidget {
  const SplitGroupDetailScreen({required this.api, required this.groupId, super.key});

  final ApiClient api;
  final String groupId;

  @override
  State<SplitGroupDetailScreen> createState() => _SplitGroupDetailScreenState();
}

class _SplitGroupDetailScreenState extends State<SplitGroupDetailScreen> {
  var _loading = true;
  String? _error;
  SplitGroupDetail? _detail;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await widget.api.splitGroupDetail(widget.groupId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  String _label(String userId) {
    SplitMember? member;
    for (final candidate in _detail?.members ?? const <SplitMember>[]) {
      if (candidate.userId == userId) member = candidate;
    }
    return member?.email ?? userId;
  }

  Future<void> _addMember() async {
    final l10n = AppLocalizations.of(context);
    final email = TextEditingController();
    final submitted = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.splitAddMemberTitle),
        content: TextField(
          controller: email,
          autofocus: true,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: l10n.emailLabel,
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(email.text.trim()),
            child: Text(l10n.commonAdd),
          ),
        ],
      ),
    );
    email.dispose();
    if (submitted == null || submitted.isEmpty || !mounted) return;
    try {
      await widget.api.addSplitMember(widget.groupId, submitted);
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _addExpense() async {
    final l10n = AppLocalizations.of(context);
    final description = TextEditingController();
    final amount = TextEditingController();
    final submitted = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.splitAddExpenseTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: description,
              autofocus: true,
              decoration: InputDecoration(
                labelText: l10n.splitDescriptionLabel,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: l10n.splitAmountLabel,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext)
                .pop((description.text.trim(), amount.text.trim())),
            child: Text(l10n.commonCreate),
          ),
        ],
      ),
    );
    description.dispose();
    amount.dispose();
    if (submitted == null || !mounted) return;
    final major = double.tryParse(submitted.$2);
    if (submitted.$1.isEmpty || major == null || major <= 0) return;
    final minor = (major * 100).round();
    try {
      await widget.api.addSplitExpense(
        widget.groupId,
        description: submitted.$1,
        amount: minor,
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  Future<void> _settleUp(SplitSuggestion suggestion) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.splitSettleUpTitle),
        content: Text(
          '${_label(suggestion.fromUserId)} → ${_label(suggestion.toUserId)}: ${suggestion.amountFormatted ?? '\$${(suggestion.amount / 100).toStringAsFixed(2)}'}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.splitRecordSettlementAction),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.api.addSplitSettlement(
        widget.groupId,
        toUserId: suggestion.toUserId,
        amount: suggestion.amount,
      );
      await _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(_detail?.group.name ?? l10n.splitTitle)),
      body: _buildBody(l10n),
    );
  }

  Widget _buildBody(AppLocalizations l10n) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: Text(l10n.commonRetry)),
            ],
          ),
        ),
      );
    }
    final detail = _detail!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.people_outline),
                title: Text(l10n.splitMembersHeading),
                trailing: TextButton(
                  onPressed: _addMember,
                  child: Text(l10n.splitAddMemberAction),
                ),
              ),
              ...detail.members.map(
                (member) => ListTile(
                  dense: true,
                  title: Text(member.email ?? member.userId),
                  subtitle: Text(member.role),
                ),
              ),
            ],
          ),
        ),
        if (detail.balances.isNotEmpty) ...[
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.balance_outlined),
                  title: Text(l10n.splitBalancesHeading),
                ),
                ...detail.balances.map(
                  (balance) => ListTile(
                    dense: true,
                    title: Text(balance.email ?? balance.userId),
                    trailing: Text(
                      balance.netFormatted ?? '\$${(balance.netAmount / 100).toStringAsFixed(2)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: balance.netAmount >= 0
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (detail.suggestions.isNotEmpty) ...[
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.currency_exchange),
                  title: Text(l10n.splitSettleUpHeading),
                ),
                ...detail.suggestions.map(
                  (suggestion) => ListTile(
                    dense: true,
                    title: Text('${_label(suggestion.fromUserId)} → ${_label(suggestion.toUserId)}'),
                    subtitle: Text(suggestion.amountFormatted ?? ''),
                    trailing: TextButton(
                      onPressed: () => _settleUp(suggestion),
                      child: Text(l10n.splitRecordSettlementAction),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.receipt_long_outlined),
                title: Text(l10n.splitExpensesHeading),
                trailing: TextButton(
                  onPressed: _addExpense,
                  child: Text(l10n.splitAddExpenseAction),
                ),
              ),
              if (detail.expenses.isEmpty)
                const ListTile(subtitle: Text('—'))
              else
                ...detail.expenses.map(
                  (expense) => ListTile(
                    dense: true,
                    title: Text(expense.description),
                    subtitle: Text('${expense.paidByEmail ?? expense.paidByUserId} • ${expense.date}'),
                    trailing: Text(
                      expense.amountFormatted ?? '\$${(expense.amount / 100).toStringAsFixed(2)}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
