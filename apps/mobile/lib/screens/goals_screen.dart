import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

class GoalsScreen extends StatefulWidget {
  const GoalsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  List<GoalProgress> _goals = const [];
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
    try {
      final goals = await widget.api.goals();
      if (mounted) setState(() => _goals = goals);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int? _minorUnits(String input, {bool allowZero = false}) {
    final match = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(input.trim());
    if (match == null) return null;
    final whole = int.tryParse(match.group(1)!);
    final cents = int.tryParse((match.group(2) ?? '').padRight(2, '0')) ?? 0;
    if (whole == null) return null;
    final value = whole * 100 + cents;
    return value > 0 || (allowZero && value == 0) ? value : null;
  }

  Future<void> _create() async {
    final name = TextEditingController();
    final target = TextEditingController();
    final saved = TextEditingController(text: '0');
    final date = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Create savings goal'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Goal name')),
              TextField(
                controller: target,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Target amount'),
              ),
              TextField(
                controller: saved,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Already saved'),
              ),
              TextField(
                controller: date,
                keyboardType: TextInputType.datetime,
                decoration: const InputDecoration(
                    labelText: 'Target date (YYYY-MM-DD, optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Create')),
        ],
      ),
    );
    final targetAmount = _minorUnits(target.text);
    final initialAmount = _minorUnits(saved.text, allowZero: true);
    final goalName = name.text.trim();
    final targetDate = date.text.trim();
    name.dispose();
    target.dispose();
    saved.dispose();
    date.dispose();
    if (submitted != true || !mounted) return;
    if (goalName.isEmpty || targetAmount == null || initialAmount == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Enter a name and valid positive target.')),
      );
      return;
    }
    try {
      await widget.api.createGoal(
        name: goalName,
        targetAmount: targetAmount,
        initialAmount: initialAmount,
        targetDate: targetDate,
      );
      await _load();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not create goal: $error')));
      }
    }
  }

  Future<void> _contribute(GoalProgress goal) async {
    final amount = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Add to ${goal.name}'),
        content: TextField(
          controller: amount,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Contribution amount'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Add')),
        ],
      ),
    );
    final value = _minorUnits(amount.text);
    amount.dispose();
    if (submitted != true || value == null) return;
    await widget.api.addGoalContribution(goal.id, value);
    await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Goals')),
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'add-goal',
          onPressed: _create,
          icon: const Icon(Icons.add),
          label: const Text('New goal'),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: FilledButton(
                        onPressed: _load, child: const Text('Retry')))
                : _goals.isEmpty
                    ? const Center(
                        child:
                            Text('Create a goal and turn saving into a plan.'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                          children: _goals
                              .map((goal) => _GoalCard(
                                  goal: goal,
                                  onContribute: () => _contribute(goal)))
                              .toList(),
                        ),
                      ),
      );
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.goal, required this.onContribute});

  final GoalProgress goal;
  final VoidCallback onContribute;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                      child: Text(goal.name,
                          style: Theme.of(context).textTheme.titleMedium)),
                  Text('${goal.percentComplete.toStringAsFixed(0)}%'),
                ],
              ),
              const SizedBox(height: 10),
              LinearProgressIndicator(
                  value: (goal.percentComplete / 100).clamp(0, 1),
                  minHeight: 8),
              const SizedBox(height: 10),
              Text('${goal.savedFormatted} saved of ${goal.targetFormatted}'),
              if (!goal.complete) Text('${goal.remainingFormatted} remaining'),
              if (goal.suggestedMonthlyFormatted != null)
                Text(
                    '${goal.suggestedMonthlyFormatted}/month reaches the target date.'),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: goal.complete ? null : onContribute,
                  icon: const Icon(Icons.savings_outlined),
                  label: Text(goal.complete ? 'Completed' : 'Add savings'),
                ),
              ),
            ],
          ),
        ),
      );
}
