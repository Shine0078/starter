import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../models/models.dart';

/// A calendar view over the conservative cash-flow forecast.
///
/// The calendar intentionally only shows events the server can explain:
/// repeatable income, detected subscriptions, and dates where the projected
/// spendable balance falls below zero. It never presents everyday spending as
/// a promise, which keeps the view aligned with the forecast contract.
class FinancialCalendarScreen extends StatefulWidget {
  const FinancialCalendarScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<FinancialCalendarScreen> createState() =>
      _FinancialCalendarScreenState();
}

class _FinancialCalendarScreenState extends State<FinancialCalendarScreen> {
  CashFlowForecast? _forecast;
  List<GoalProgress> _goals = const [];
  List<String> _currencies = const ['USD'];
  String _currency = 'USD';
  DateTime? _month;
  String? _selectedDate;
  bool _loading = true;
  String? _error;

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
      final accounts = await widget.api.accounts();
      List<GoalProgress> goals = const [];
      try {
        goals = await widget.api.goals();
      } catch (_) {
        // Goal milestones are an enhancement; keep the forecast calendar
        // useful when an older server does not expose goals yet.
      }
      final currencies = accounts
          .map((account) => account.currency)
          .where((currency) => currency.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      if (currencies.isNotEmpty && !currencies.contains(_currency)) {
        _currency = currencies.first;
      }
      if (currencies.isNotEmpty) _currencies = currencies;
      final forecast =
          await widget.api.cashFlowForecast(days: 90, currency: _currency);
      if (!mounted) return;
      final firstDate = forecast.points.isEmpty
          ? DateTime.now()
          : _parseDate(forecast.points.first.date);
      setState(() {
        _forecast = forecast;
        _goals = goals;
        _month ??= DateTime(firstDate.year, firstDate.month);
        if (_selectedDate == null) {
          if (forecast.events.isNotEmpty) {
            _selectedDate = forecast.events.first.date;
          } else if (forecast.lowBalanceDates.isNotEmpty) {
            _selectedDate = forecast.lowBalanceDates.first;
          } else {
            _selectedDate = _goals
                .where((goal) => !goal.complete)
                .map((goal) => goal.targetDate)
                .whereType<String>()
                .firstWhere((date) => _isInForecast(date), orElse: () => '');
            if (_selectedDate!.isEmpty) _selectedDate = null;
          }
        }
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

  DateTime _parseDate(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return DateTime.now();
    return DateTime(parsed.year, parsed.month, parsed.day);
  }

  DateTime get _firstMonth {
    final points = _forecast?.points ?? const <ForecastPoint>[];
    if (points.isEmpty) {
      final now = DateTime.now();
      return DateTime(now.year, now.month);
    }
    final date = _parseDate(points.first.date);
    return DateTime(date.year, date.month);
  }

  DateTime get _lastMonth {
    final points = _forecast?.points ?? const <ForecastPoint>[];
    if (points.isEmpty) return _firstMonth;
    final date = _parseDate(points.last.date);
    return DateTime(date.year, date.month);
  }

  void _moveMonth(int delta) {
    final current = _month ?? _firstMonth;
    final next = DateTime(current.year, current.month + delta);
    if (next.isBefore(_firstMonth) || next.isAfter(_lastMonth)) return;
    setState(() {
      _month = next;
      _selectedDate = null;
    });
  }

  List<ForecastEvent> _eventsFor(String date) => (_forecast?.events ?? const [])
      .where((event) => event.date == date)
      .toList();

  List<GoalProgress> _goalsFor(String date) => _goals
      .where((goal) => !goal.complete && goal.targetDate == date)
      .toList();

  bool _isInForecast(String date) {
    final points = _forecast?.points ?? const <ForecastPoint>[];
    if (points.isEmpty) return false;
    final day = _parseDate(date);
    final first = _parseDate(points.first.date);
    final last = _parseDate(points.last.date);
    // The API normally returns one point per day, but the calendar uses the
    // forecast's date range rather than requiring a point for every cell. That
    // keeps a partially cached response from hiding a known recurring event.
    return !day.isBefore(first) && !day.isAfter(last);
  }

  @override
  Widget build(BuildContext context) {
    final month = _month ?? _firstMonth;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial calendar'),
        actions: [
          IconButton(
            tooltip: 'Refresh calendar',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    children: [
                      _summary(context),
                      const SizedBox(height: 12),
                      _controls(context),
                      const SizedBox(height: 12),
                      _calendar(context, month),
                      const SizedBox(height: 12),
                      _selectedDay(context),
                      const SizedBox(height: 12),
                      Text(
                        'This view uses repeatable income and recurring bills only. '
                        'Actual balances can differ when everyday spending or a bank sync is missing.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _summary(BuildContext context) {
    final forecast = _forecast!;
    final low = forecast.lowBalanceDates.length;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Next 90 days',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              '${forecast.events.length} expected event${forecast.events.length == 1 ? '' : 's'} · '
              '$low low-balance date${low == 1 ? '' : 's'}',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 24,
              runSpacing: 8,
              children: [
                _SummaryMetric(
                    label: 'Starting balance',
                    value: forecast.startingBalanceFormatted),
                _SummaryMetric(
                    label: 'Projected ending',
                    value: forecast.endingBalanceFormatted),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _controls(BuildContext context) {
    final month = _month ?? _firstMonth;
    final previousEnabled = month.isAfter(_firstMonth);
    final nextEnabled = month.isBefore(_lastMonth);
    return Row(
      children: [
        DropdownButton<String>(
          value: _currency,
          items: _currencies
              .map((currency) => DropdownMenuItem(
                    value: currency,
                    child: Text(currency),
                  ))
              .toList(),
          onChanged: _loading
              ? null
              : (value) {
                  if (value == null) return;
                  setState(() {
                    _currency = value;
                    _month = null;
                    _selectedDate = null;
                  });
                  _load();
                },
        ),
        const Spacer(),
        IconButton(
          tooltip: 'Previous month',
          onPressed: previousEnabled ? () => _moveMonth(-1) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Text(DateFormat.yMMMM().format(month),
            style: Theme.of(context).textTheme.titleMedium),
        IconButton(
          tooltip: 'Next month',
          onPressed: nextEnabled ? () => _moveMonth(1) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }

  Widget _calendar(BuildContext context, DateTime month) {
    final theme = Theme.of(context);
    final firstDay = DateTime(month.year, month.month, 1);
    final leading = firstDay.weekday - 1;
    final days = DateTime(month.year, month.month + 1, 0).day;
    final children = <Widget>[];
    for (final label in const [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun'
    ]) {
      children.add(Center(
        child: Text(label, style: theme.textTheme.labelSmall),
      ));
    }
    children.addAll(List<Widget>.filled(leading, const SizedBox.shrink()));
    for (var day = 1; day <= days; day += 1) {
      final date = DateTime(month.year, month.month, day);
      final iso = DateFormat('yyyy-MM-dd').format(date);
      final events = _eventsFor(iso);
      final goals = _goalsFor(iso);
      final low = _forecast?.lowBalanceDates.contains(iso) ?? false;
      final inForecast = _isInForecast(iso);
      final selected = _selectedDate == iso;
      children.add(Semantics(
        button: true,
        label: _dayLabel(date, events, goals, low, inForecast),
        selected: selected,
        child: InkWell(
          onTap: inForecast ? () => setState(() => _selectedDate = iso) : null,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            margin: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: selected
                  ? theme.colorScheme.primaryContainer
                  : low
                      ? theme.colorScheme.errorContainer
                      : null,
              border: Border.all(
                color: inForecast
                    ? theme.colorScheme.outlineVariant
                    : theme.colorScheme.surfaceContainerHighest,
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Padding(
              padding: const EdgeInsets.all(5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$day', style: theme.textTheme.labelLarge),
                  const Spacer(),
                  if (events.isNotEmpty)
                    Row(
                      children: [
                        Icon(
                          events.any((event) => event.kind == 'income')
                              ? Icons.arrow_downward
                              : Icons.arrow_upward,
                          size: 13,
                          color: events.any((event) => event.kind == 'income')
                              ? theme.colorScheme.primary
                              : theme.colorScheme.tertiary,
                        ),
                        if (events.length > 1)
                          Text(' ${events.length}',
                              style: theme.textTheme.labelSmall),
                      ],
                    ),
                  if (goals.isNotEmpty)
                    Icon(Icons.flag_outlined,
                        size: 14, color: theme.colorScheme.primary),
                  if (low)
                    Icon(Icons.warning_amber_rounded,
                        size: 15, color: theme.colorScheme.error),
                ],
              ),
            ),
          ),
        ),
      ));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 0.82,
          children: children,
        ),
      ),
    );
  }

  String _dayLabel(DateTime date, List<ForecastEvent> events,
      List<GoalProgress> goals, bool low, bool inForecast) {
    if (!inForecast) {
      return '${DateFormat.yMMMMd().format(date)} outside forecast';
    }
    final details = <String>[];
    details.addAll(events
        .map((event) => '${event.merchant}, ${event.amountFormatted}')
        .toList());
    details.addAll(goals.map((goal) => 'goal target, ${goal.name}'));
    if (details.isEmpty) details.add('no expected events');
    return '${DateFormat.yMMMMd().format(date)}: ${details.join('; ')}${low ? '; projected low balance' : ''}';
  }

  Widget _selectedDay(BuildContext context) {
    final date = _selectedDate;
    if (date == null) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.touch_app_outlined),
          title: Text('Select a forecast date'),
          subtitle: Text('Tap a highlighted day to see expected events.'),
        ),
      );
    }
    final events = _eventsFor(date);
    final goals = _goalsFor(date);
    final low = _forecast?.lowBalanceDates.contains(date) ?? false;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(DateFormat.yMMMMd().format(_parseDate(date)),
                  style: Theme.of(context).textTheme.titleMedium),
            ),
            if (low)
              ListTile(
                dense: true,
                leading: Icon(Icons.warning_amber_rounded,
                    color: Theme.of(context).colorScheme.error),
                title: const Text('Projected low balance'),
                subtitle: const Text(
                    'Review bills or plan a buffer before this date.'),
              ),
            if (events.isEmpty && !low)
              const ListTile(
                dense: true,
                leading: Icon(Icons.event_available_outlined),
                title: Text('No expected recurring events'),
              ),
            for (final event in events)
              ListTile(
                dense: true,
                leading: Icon(event.kind == 'income'
                    ? Icons.south_west
                    : Icons.north_east),
                title: Text(event.merchant),
                subtitle: Text(
                    '${event.kind == 'income' ? 'Expected income' : 'Expected bill'} · ${(event.confidence * 100).round()}% pattern confidence'),
                trailing: Text(event.amountFormatted),
              ),
            for (final goal in goals)
              ListTile(
                dense: true,
                leading: const Icon(Icons.flag_outlined),
                title: Text(goal.name),
                subtitle: Text(
                    'Savings goal target · ${goal.remainingFormatted} remaining${goal.suggestedMonthlyFormatted == null ? '' : ' · ${goal.suggestedMonthlyFormatted} suggested monthly'}'),
                trailing: Text(goal.targetFormatted),
              ),
          ],
        ),
      ),
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ],
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48),
              const SizedBox(height: 12),
              const Text('Calendar is unavailable',
                  style: TextStyle(fontSize: 18)),
              const SizedBox(height: 6),
              const Text('Check your connection and try again.'),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
              const SizedBox(height: 8),
              Text(message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      );
}
