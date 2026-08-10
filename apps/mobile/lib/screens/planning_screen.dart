import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../models/models.dart';
import 'financial_calendar_screen.dart';

class PlanningScreen extends StatefulWidget {
  const PlanningScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<PlanningScreen> createState() => _PlanningScreenState();
}

class _PlanningScreenState extends State<PlanningScreen> {
  final _amount = TextEditingController();
  int _days = 30;
  String _currency = 'USD';
  List<String> _currencies = const ['USD'];
  DateTime _purchaseDate = DateTime.now().add(const Duration(days: 1));
  CashFlowForecast? _forecast;
  PurchaseScenario? _scenario;
  bool _loading = true;
  bool _simulating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    try {
      final accounts = await widget.api.accounts();
      final currencies = accounts
          .map((account) => account.currency)
          .where((currency) => currency.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      if (currencies.isNotEmpty) {
        _currencies = currencies;
        _currency = currencies.first;
      }
      await _loadForecast();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadForecast() async {
    setState(() {
      _loading = true;
      _error = null;
      _scenario = null;
    });
    try {
      final forecast =
          await widget.api.cashFlowForecast(days: _days, currency: _currency);
      if (mounted) setState(() => _forecast = forecast);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int? _minorUnits(String input) {
    final match = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(input.trim());
    if (match == null) return null;
    final whole = int.tryParse(match.group(1)!);
    final cents = int.tryParse((match.group(2) ?? '').padRight(2, '0')) ?? 0;
    if (whole == null) return null;
    final value = whole * 100 + cents;
    return value > 0 ? value : null;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final first = DateTime(now.year, now.month, now.day + 1);
    final last = first.add(Duration(days: _days - 1));
    final initial = _purchaseDate.isBefore(first) || _purchaseDate.isAfter(last)
        ? first
        : _purchaseDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
    );
    if (picked != null && mounted) setState(() => _purchaseDate = picked);
  }

  Future<void> _simulate() async {
    final amount = _minorUnits(_amount.text);
    if (amount == null) {
      setState(
          () => _error = 'Enter a positive amount with at most two decimals.');
      return;
    }
    setState(() {
      _simulating = true;
      _error = null;
    });
    try {
      final scenario = await widget.api.purchaseScenario(
        amount: amount,
        date: DateFormat('yyyy-MM-dd').format(_purchaseDate),
        days: _days,
        currency: _currency,
      );
      if (mounted) setState(() => _scenario = scenario);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _simulating = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Cash-flow planning')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                DropdownButton<String>(
                  value: _currency,
                  items: _currencies
                      .map((value) => DropdownMenuItem(
                            value: value,
                            child: Text(value),
                          ))
                      .toList(),
                  onChanged: _loading
                      ? null
                      : (value) {
                          if (value == null) return;
                          _currency = value;
                          _loadForecast();
                        },
                ),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 7, label: Text('7d')),
                    ButtonSegment(value: 30, label: Text('30d')),
                    ButtonSegment(value: 90, label: Text('90d')),
                  ],
                  selected: {_days},
                  onSelectionChanged: _loading
                      ? null
                      : (values) {
                          _days = values.first;
                          _purchaseDate =
                              DateTime.now().add(const Duration(days: 1));
                          _loadForecast();
                        },
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading) const LinearProgressIndicator(),
            if (_error != null)
              Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: ListTile(
                  leading: const Icon(Icons.error_outline),
                  title: Text(_error!),
                ),
              ),
            if (_forecast case final forecast?) ...[
              _ForecastCard(forecast: forecast),
              const SizedBox(height: 12),
              _PurchaseCard(
                amount: _amount,
                currency: _currency,
                date: _purchaseDate,
                working: _simulating,
                onPickDate: _pickDate,
                onSimulate: _simulate,
                scenario: _scenario,
              ),
              const SizedBox(height: 12),
              _UpcomingEvents(events: forecast.events),
              const SizedBox(height: 12),
              FilledButton.tonalIcon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => FinancialCalendarScreen(api: widget.api),
                )),
                icon: const Icon(Icons.calendar_month_outlined),
                label: const Text('Open financial calendar'),
              ),
            ],
          ],
        ),
      );
}

class _ForecastCard extends StatelessWidget {
  const _ForecastCard({required this.forecast});

  final CashFlowForecast forecast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final low = forecast.lowBalanceDates.length;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Conservative forecast', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Repeatable income and bills only. Everyday spending is not predicted.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 24,
              runSpacing: 8,
              children: [
                _Metric(
                    label: 'Today', value: forecast.startingBalanceFormatted),
                _Metric(label: 'End', value: forecast.endingBalanceFormatted),
              ],
            ),
            const SizedBox(height: 16),
            Semantics(
              label:
                  'Cash flow forecast from ${forecast.startingBalanceFormatted} to ${forecast.endingBalanceFormatted}. ${low == 0 ? 'No modeled negative balance dates.' : '$low modeled negative balance dates.'}',
              child: ExcludeSemantics(
                child: SizedBox(
                  key: const Key('cash-flow-chart'),
                  height: 150,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: _ForecastPainter(
                      points: forecast.points,
                      line: theme.colorScheme.primary,
                      warning: theme.colorScheme.error,
                      axis: theme.colorScheme.outlineVariant,
                    ),
                  ),
                ),
              ),
            ),
            if (low > 0) ...[
              const SizedBox(height: 10),
              Text(
                '$low projected low-balance day${low == 1 ? '' : 's'}',
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
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

class _PurchaseCard extends StatelessWidget {
  const _PurchaseCard({
    required this.amount,
    required this.currency,
    required this.date,
    required this.working,
    required this.onPickDate,
    required this.onSimulate,
    required this.scenario,
  });

  final TextEditingController amount;
  final String currency;
  final DateTime date;
  final bool working;
  final VoidCallback onPickDate;
  final VoidCallback onSimulate;
  final PurchaseScenario? scenario;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Can I afford a purchase?',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextField(
                controller: amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: 'Purchase amount ($currency)',
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Purchase date'),
                subtitle: Text(DateFormat.yMMMd().format(date)),
                trailing: const Icon(Icons.calendar_month_outlined),
                onTap: onPickDate,
              ),
              FilledButton.icon(
                onPressed: working ? null : onSimulate,
                icon: const Icon(Icons.calculate_outlined),
                label: Text(working ? 'Checking…' : 'Check scenario'),
              ),
              if (scenario case final result?) ...[
                const Divider(height: 28),
                _Metric(
                  label: 'After purchase',
                  value: result.balanceAfterPurchaseFormatted,
                ),
                const SizedBox(height: 6),
                _Metric(
                  label: 'End of forecast',
                  value: result.endingBalanceFormatted,
                ),
                const SizedBox(height: 10),
                for (final warning in result.warnings)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 5),
                    child: Text('• $warning'),
                  ),
              ],
            ],
          ),
        ),
      );
}

class _UpcomingEvents extends StatelessWidget {
  const _UpcomingEvents({required this.events});
  final List<ForecastEvent> events;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text('Expected recurring events',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              if (events.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text('No strong recurring pattern was found.'),
                ),
              for (final event in events.take(8))
                ListTile(
                  leading: Icon(event.kind == 'income'
                      ? Icons.south_west
                      : Icons.north_east),
                  title: Text(event.merchant),
                  subtitle: Text(
                    '${event.date} · ${(event.confidence * 100).round()}% pattern confidence',
                  ),
                  trailing: Text(event.amountFormatted),
                ),
            ],
          ),
        ),
      );
}

class _ForecastPainter extends CustomPainter {
  const _ForecastPainter({
    required this.points,
    required this.line,
    required this.warning,
    required this.axis,
  });

  final List<ForecastPoint> points;
  final Color line;
  final Color warning;
  final Color axis;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final balances = points.map((point) => point.balance).toList();
    var minimum = balances.reduce(math.min);
    var maximum = balances.reduce(math.max);
    minimum = math.min(minimum, 0);
    maximum = math.max(maximum, 0);
    if (minimum == maximum) maximum = minimum + 1;
    const padding = 4.0;
    final width = size.width - padding * 2;
    final height = size.height - padding * 2;
    double x(int index) =>
        padding +
        (points.length == 1 ? width / 2 : width * index / (points.length - 1));
    double y(int balance) =>
        padding + height * (maximum - balance) / (maximum - minimum);

    final zeroY = y(0);
    canvas.drawLine(
      Offset(padding, zeroY),
      Offset(size.width - padding, zeroY),
      Paint()
        ..color = axis
        ..strokeWidth = 1,
    );

    final path = Path()..moveTo(x(0), y(points.first.balance));
    for (var index = 1; index < points.length; index += 1) {
      path.lineTo(x(index), y(points[index].balance));
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = balances.any((balance) => balance < 0) ? warning : line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _ForecastPainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.line != line ||
      oldDelegate.warning != warning ||
      oldDelegate.axis != axis;
}
