/// An amount of money, rendered so it cannot be misread.
///
/// Three things every amount in this app has to get right, and which are easy
/// to get wrong one screen at a time:
///
/// 1. **The server formats it.** The string comes from the API, which knows the
///    currency's minor-unit exponent. The client never divides by 100 — that is
///    how a JPY balance ends up a hundred times wrong (ADR-0003).
/// 2. **Direction is never colour alone.** An explicit `+` or `−` accompanies
///    the colour, because a colour-blind reader would otherwise see two
///    identical numbers (MISSION2 §41).
/// 3. **It reads aloud correctly.** A screen reader given "−$4.50" says
///    something unhelpful, so the semantics label spells out "4.50 dollars
///    out" instead.
library;

import 'package:flutter/material.dart';

import '../colors.dart';
import '../typography.dart';

enum MoneyEmphasis { display, large, row, small }

/// How an amount's direction should be interpreted.
enum MoneyTone {
  /// Positive is income, negative is spending. The default.
  signed,

  /// Always neutral — a balance, a limit, a budget. A £500 limit is not income.
  neutral,

  /// Positive is *good news* rather than income: spending less than last month.
  trend,
}

class MoneyText extends StatelessWidget {
  const MoneyText({
    required this.formatted,
    required this.amountMinor,
    this.emphasis = MoneyEmphasis.row,
    this.tone = MoneyTone.signed,
    this.showSign = true,
    this.semanticsPrefix,
    this.color,
    super.key,
  });

  /// Preformatted by the API, including its currency symbol.
  final String formatted;

  /// The same amount in minor units. Used for direction and for reading aloud,
  /// never for formatting.
  final int amountMinor;

  final MoneyEmphasis emphasis;
  final MoneyTone tone;

  /// Suppress the leading sign where the surrounding label already says which
  /// way the money went — a "Spent this month" tile does not need a minus.
  final bool showSign;

  /// Prepended to the spoken label, e.g. "Rewards Visa balance".
  final String? semanticsPrefix;

  /// Overrides the tone-derived colour. Use sparingly.
  final Color? color;

  bool get _isNegative => amountMinor < 0;
  bool get _isZero => amountMinor == 0;

  @override
  Widget build(BuildContext context) {
    final fin = context.finColors;
    final scheme = Theme.of(context).colorScheme;

    final resolved = color ??
        switch (tone) {
          MoneyTone.neutral => scheme.onSurface,
          MoneyTone.signed when _isZero => scheme.onSurface,
          MoneyTone.signed => _isNegative ? fin.expense : fin.income,
          MoneyTone.trend when _isZero => fin.neutral,
          MoneyTone.trend => _isNegative ? fin.negativeTrend : fin.positiveTrend,
        };

    final style = switch (emphasis) {
      MoneyEmphasis.display => FinType.moneyDisplay,
      MoneyEmphasis.large => FinType.moneyLarge,
      MoneyEmphasis.row => FinType.moneyRow,
      MoneyEmphasis.small => FinType.moneySmall,
    };

    // The API already includes a minus for negatives, so a sign is added only
    // for positives — printing "+-$4.50" would be worse than printing nothing.
    final needsPlus =
        showSign && tone != MoneyTone.neutral && !_isZero && !_isNegative;
    final display = needsPlus ? '+$formatted' : formatted;

    return Text(
      display,
      style: style.copyWith(color: resolved),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      semanticsLabel: _spoken(display),
    );
  }

  String _spoken(String display) {
    final prefix = semanticsPrefix == null ? '' : '${semanticsPrefix!}, ';
    // Strip the typographic minus so it is not read as a hyphen or skipped.
    final bare = display.replaceAll('-', '').replaceAll('−', '').replaceAll('+', '');

    if (tone == MoneyTone.neutral || _isZero) return '$prefix$bare';
    if (tone == MoneyTone.trend) {
      return '$prefix$bare ${_isNegative ? 'down' : 'up'}';
    }
    return '$prefix$bare ${_isNegative ? 'out' : 'in'}';
  }
}
