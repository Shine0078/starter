import 'package:flutter/material.dart';

import '../api/client.dart';
import '../models/models.dart';

/// A private, deterministic finance guide. The server answers from aggregates
/// already needed by the dashboard; no raw transactions are sent to an LLM.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  static const prompts = [
    'Where did I spend the most?',
    'How much did I save?',
    'Which subscriptions am I paying for?',
    'Is my spending higher than usual?',
  ];

  final _question = TextEditingController();
  AssistantAnswer? _answer;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _question.dispose();
    super.dispose();
  }

  Future<void> _ask([String? prompt]) async {
    final value = (prompt ?? _question.text).trim();
    if (value.length < 2) {
      setState(() => _error = 'Ask a question about your spending or savings.');
      return;
    }
    _question.text = value;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final answer = await widget.api.askAssistant(value);
      if (mounted) setState(() => _answer = answer);
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Ask FINVERSE')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('A clear view of your money',
                      style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(
                    'Ask about spending, savings, merchants, or recurring charges. Answers use your selected-period aggregates and stay on FINVERSE.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _question,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _ask(),
                    decoration: InputDecoration(
                      labelText: 'Your question',
                      hintText: 'Where did I spend the most?',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        tooltip: 'Ask',
                        onPressed: _loading ? null : _ask,
                        icon: const Icon(Icons.send_outlined),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text('Try one of these', style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: prompts
                .map((prompt) => ActionChip(
                      label: Text(prompt),
                      onPressed: _loading ? null : () => _ask(prompt),
                    ))
                .toList(),
          ),
          if (_loading) ...[
            const SizedBox(height: 20),
            const LinearProgressIndicator(),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            Card(
              color: theme.colorScheme.errorContainer,
              child: ListTile(
                leading: const Icon(Icons.error_outline),
                title: const Text('Could not answer that yet'),
                subtitle: Text(_error!),
              ),
            ),
          ],
          if (_answer case final answer?) ...[
            const SizedBox(height: 16),
            Semantics(
              liveRegion: true,
              label: answer.answer,
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.auto_awesome_outlined,
                              color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Text('Your answer',
                              style: theme.textTheme.titleMedium),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(answer.answer, style: theme.textTheme.bodyLarge),
                      if (answer.facts.isNotEmpty) ...[
                        const Divider(height: 28),
                        for (final fact in answer.facts)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Flexible(child: Text(fact.label)),
                                const SizedBox(width: 12),
                                Flexible(
                                  child: Text(
                                    fact.value,
                                    textAlign: TextAlign.end,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        answer.caveat,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
