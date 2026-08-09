/// Colours that carry financial meaning.
///
/// Deliberately *not* named for what they look like. `FinColors.income` says
/// what it is for; `green` says what it is, and then somebody uses green for a
/// success toast and the two drift apart.
///
/// These live in a [ThemeExtension] so light and dark each supply their own
/// values and no widget has to ask which mode it is in.
///
/// **Colour is never the only signal** (MISSION2 §41). Every place these are
/// used also carries a sign, an arrow, or a word, because roughly one in twelve
/// men cannot reliably separate red from green — and in a finance app that is
/// the difference between money arriving and money leaving.
library;

import 'package:flutter/material.dart';

@immutable
class FinColors extends ThemeExtension<FinColors> {
  const FinColors({
    required this.income,
    required this.onIncomeContainer,
    required this.incomeContainer,
    required this.expense,
    required this.onExpenseContainer,
    required this.expenseContainer,
    required this.warning,
    required this.warningContainer,
    required this.onWarningContainer,
    required this.positiveTrend,
    required this.negativeTrend,
    required this.neutral,
    required this.skeleton,
    required this.skeletonHighlight,
    required this.chartSeries,
  });

  /// Money arriving.
  final Color income;
  final Color incomeContainer;
  final Color onIncomeContainer;

  /// Money leaving.
  final Color expense;
  final Color expenseContainer;
  final Color onExpenseContainer;

  /// Needs attention but is not yet a failure — a card nearing its limit, a
  /// bank connection that will expire.
  final Color warning;
  final Color warningContainer;
  final Color onWarningContainer;

  /// Direction of travel, which is *not* the same as income and expense:
  /// spending less than last month is a positive trend and an expense.
  final Color positiveTrend;
  final Color negativeTrend;

  /// Deliberately unremarkable. Transfers and other movements that are neither
  /// income nor spending.
  final Color neutral;

  final Color skeleton;
  final Color skeletonHighlight;

  /// Categorical series for charts, in order.
  ///
  /// Ordered so neighbouring entries differ in lightness as well as hue, which
  /// keeps a pie chart readable in greyscale and to a colour-blind reader.
  final List<Color> chartSeries;

  static const light = FinColors(
    income: Color(0xFF00696D),
    incomeContainer: Color(0xFFCFF7F5),
    onIncomeContainer: Color(0xFF00201F),
    expense: Color(0xFFA4343A),
    expenseContainer: Color(0xFFFFE1E1),
    onExpenseContainer: Color(0xFF3B0708),
    warning: Color(0xFF8A5300),
    warningContainer: Color(0xFFFFEBD1),
    onWarningContainer: Color(0xFF2C1700),
    positiveTrend: Color(0xFF00696D),
    negativeTrend: Color(0xFFA4343A),
    neutral: Color(0xFF5A5F6A),
    skeleton: Color(0xFFE4E7EC),
    skeletonHighlight: Color(0xFFF4F6F9),
    chartSeries: [
      Color(0xFF2F6DF6),
      Color(0xFF00A0A6),
      Color(0xFF7A4FD4),
      Color(0xFFD97706),
      Color(0xFF3F7F3F),
      Color(0xFFB5397F),
      Color(0xFF5A6B8C),
      Color(0xFF9A6B2F),
    ],
  );

  /// Not the light palette dimmed. Saturated reds and greens vibrate against a
  /// dark background and fail contrast; these are lifted in lightness and
  /// pulled back in chroma so they stay legible at 4.5:1 on the dark surface.
  static const dark = FinColors(
    income: Color(0xFF4FDBD6),
    incomeContainer: Color(0xFF00504F),
    onIncomeContainer: Color(0xFFCFF7F5),
    expense: Color(0xFFFFB3B3),
    expenseContainer: Color(0xFF6B1D22),
    onExpenseContainer: Color(0xFFFFE1E1),
    warning: Color(0xFFFFC46B),
    warningContainer: Color(0xFF5C3A00),
    onWarningContainer: Color(0xFFFFEBD1),
    positiveTrend: Color(0xFF4FDBD6),
    negativeTrend: Color(0xFFFFB3B3),
    neutral: Color(0xFFA8AEBB),
    skeleton: Color(0xFF232A36),
    skeletonHighlight: Color(0xFF2E3746),
    chartSeries: [
      Color(0xFF7FA9FF),
      Color(0xFF4FD5DB),
      Color(0xFFB79BFF),
      Color(0xFFFFB86B),
      Color(0xFF86C986),
      Color(0xFFFF8FC4),
      Color(0xFF9FB0CE),
      Color(0xFFE0B071),
    ],
  );

  @override
  FinColors copyWith({
    Color? income,
    Color? incomeContainer,
    Color? onIncomeContainer,
    Color? expense,
    Color? expenseContainer,
    Color? onExpenseContainer,
    Color? warning,
    Color? warningContainer,
    Color? onWarningContainer,
    Color? positiveTrend,
    Color? negativeTrend,
    Color? neutral,
    Color? skeleton,
    Color? skeletonHighlight,
    List<Color>? chartSeries,
  }) =>
      FinColors(
        income: income ?? this.income,
        incomeContainer: incomeContainer ?? this.incomeContainer,
        onIncomeContainer: onIncomeContainer ?? this.onIncomeContainer,
        expense: expense ?? this.expense,
        expenseContainer: expenseContainer ?? this.expenseContainer,
        onExpenseContainer: onExpenseContainer ?? this.onExpenseContainer,
        warning: warning ?? this.warning,
        warningContainer: warningContainer ?? this.warningContainer,
        onWarningContainer: onWarningContainer ?? this.onWarningContainer,
        positiveTrend: positiveTrend ?? this.positiveTrend,
        negativeTrend: negativeTrend ?? this.negativeTrend,
        neutral: neutral ?? this.neutral,
        skeleton: skeleton ?? this.skeleton,
        skeletonHighlight: skeletonHighlight ?? this.skeletonHighlight,
        chartSeries: chartSeries ?? this.chartSeries,
      );

  @override
  FinColors lerp(ThemeExtension<FinColors>? other, double t) {
    if (other is! FinColors) return this;
    return FinColors(
      income: Color.lerp(income, other.income, t)!,
      incomeContainer: Color.lerp(incomeContainer, other.incomeContainer, t)!,
      onIncomeContainer: Color.lerp(onIncomeContainer, other.onIncomeContainer, t)!,
      expense: Color.lerp(expense, other.expense, t)!,
      expenseContainer: Color.lerp(expenseContainer, other.expenseContainer, t)!,
      onExpenseContainer: Color.lerp(onExpenseContainer, other.onExpenseContainer, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningContainer: Color.lerp(warningContainer, other.warningContainer, t)!,
      onWarningContainer: Color.lerp(onWarningContainer, other.onWarningContainer, t)!,
      positiveTrend: Color.lerp(positiveTrend, other.positiveTrend, t)!,
      negativeTrend: Color.lerp(negativeTrend, other.negativeTrend, t)!,
      neutral: Color.lerp(neutral, other.neutral, t)!,
      skeleton: Color.lerp(skeleton, other.skeleton, t)!,
      skeletonHighlight: Color.lerp(skeletonHighlight, other.skeletonHighlight, t)!,
      chartSeries: t < 0.5 ? chartSeries : other.chartSeries,
    );
  }
}

/// Reads the financial palette. Falls back to the light set rather than
/// throwing, so a widget rendered outside the app theme in a test still paints.
extension FinColorsOf on BuildContext {
  FinColors get finColors =>
      Theme.of(this).extension<FinColors>() ?? FinColors.light;
}
