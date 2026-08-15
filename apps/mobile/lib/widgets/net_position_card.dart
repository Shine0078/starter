import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../design/design.dart';
import '../models/models.dart';

/// A currency-safe balance-sheet summary, presented as the app's hero.
///
/// Balances in different currencies are intentionally never added together.
/// Doing so without a quoted FX rate would show a precise but false net worth.
///
/// This is the one surface allowed to be loud: it is the single number every
/// user opens the app to see, so it gets the brand gradient while the rest of
/// the dashboard stays calm and outlined.
class NetPositionCard extends StatelessWidget {
  const NetPositionCard({required this.accounts, super.key});

  final List<Account> accounts;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fin = context.finColors;
    final positions = _positions(accounts);

    return ClipRRect(
      borderRadius: FinRadius.cardBorder,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [fin.heroGradientStart, fin.heroGradientEnd],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.account_balance_wallet_outlined,
                      size: 18, color: fin.onHeroMuted),
                  const SizedBox(width: FinSpace.sm),
                  Text(
                    'Net position',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: fin.onHeroMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${accounts.length} connected account${accounts.length == 1 ? '' : 's'}',
                style: theme.textTheme.bodySmall?.copyWith(color: fin.onHeroMuted),
              ),
              if (positions.length > 1) ...[
                const SizedBox(height: 6),
                Text(
                  'Currencies are shown separately; no estimated exchange rate is applied.',
                  style:
                      theme.textTheme.bodySmall?.copyWith(color: fin.onHeroMuted),
                ),
              ],
              if (positions.isEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  'Connect an account to see your assets and debts.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: fin.onHero),
                ),
              ],
              for (final position in positions) ...[
                const SizedBox(height: 16),
                _CurrencyPosition(position: position, fin: fin),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrencyPosition extends StatelessWidget {
  const _CurrencyPosition({required this.position, required this.fin});

  final _Position position;
  final FinColors fin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maximum =
        position.assets > position.debts ? position.assets : position.debts;
    final divisor = maximum == 0 ? 1 : maximum;
    final net = _money(position.net, position.currency);
    final assets = _money(position.assets, position.currency);
    final debts = _money(position.debts, position.currency);

    return Semantics(
      container: true,
      label:
          '${position.currency} net position $net. Assets $assets. Debts $debts.',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 10,
              runSpacing: 2,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  net,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: fin.onHero,
                  ),
                ),
                Text(
                  position.currency,
                  style: theme.textTheme.labelLarge?.copyWith(color: fin.onHeroMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _BalanceBar(
              label: 'Assets',
              amount: assets,
              value: position.assets / divisor,
              color: fin.onHero,
            ),
            const SizedBox(height: 9),
            _BalanceBar(
              label: 'Debts',
              amount: debts,
              value: position.debts / divisor,
              color: fin.heroDebt,
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceBar extends StatelessWidget {
  const _BalanceBar({
    required this.label,
    required this.amount,
    required this.value,
    required this.color,
  });

  final String label;
  final String amount;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: color.withValues(alpha: 0.9)),
                ),
              ),
              Flexible(
                child: Text(
                  amount,
                  textAlign: TextAlign.end,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: color, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: value.clamp(0, 1),
              minHeight: 8,
              color: color,
              backgroundColor: color.withValues(alpha: 0.22),
            ),
          ),
        ],
      );
}

class _Position {
  const _Position({
    required this.currency,
    required this.assets,
    required this.debts,
  });

  final String currency;
  final int assets;
  final int debts;
  int get net => assets - debts;
}

List<_Position> _positions(List<Account> accounts) {
  final totals = <String, (int, int)>{};
  for (final account in accounts) {
    final currency = account.currency.trim().toUpperCase();
    final key = currency.isEmpty ? 'USD' : currency;
    final current = totals[key] ?? (0, 0);
    totals[key] = account.balanceCurrent >= 0
        ? (current.$1 + account.balanceCurrent, current.$2)
        : (current.$1, current.$2 + account.balanceCurrent.abs());
  }

  final positions = totals.entries
      .map((entry) => _Position(
            currency: entry.key,
            assets: entry.value.$1,
            debts: entry.value.$2,
          ))
      .toList();
  positions.sort((a, b) => a.currency.compareTo(b.currency));
  return positions;
}

String _money(int minorUnits, String currency) => NumberFormat.simpleCurrency(
      name: currency,
      decimalDigits: 2,
    ).format(minorUnits / 100);
