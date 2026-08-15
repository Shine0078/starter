/// The FINVERSE theme, assembled from the tokens.
///
/// Everything visual is decided here so screens contain layout and content
/// rather than styling. A screen that sets its own colours is a screen that
/// will look wrong the first time the palette changes.
library;

import 'package:flutter/material.dart';

import 'colors.dart';
import 'tokens.dart';
import 'typography.dart';

abstract final class FinTheme {
  /// The brand seed. Emerald-teal reads as money itself — the register of a
  /// savings app rather than an institution's back office — while the lighter
  /// greens and the red stay reserved for money moving, so they still mean
  /// something when they appear.
  static const Color seed = Color(0xFF0E7C66);

  static ThemeData light([Color? brandSeed]) =>
      _build(Brightness.light, FinColors.light, brandSeed);
  static ThemeData dark([Color? brandSeed]) =>
      _build(Brightness.dark, FinColors.dark, brandSeed);

  static ThemeData _build(
      Brightness brightness, FinColors fin, Color? brandSeed) {
    final selectedSeed = brandSeed ?? seed;
    final scheme =
        ColorScheme.fromSeed(seedColor: selectedSeed, brightness: brightness);
    final heroBase = brightness == Brightness.light
        ? scheme.primary
        : scheme.primaryContainer;
    final heroEnd = Color.lerp(heroBase, Colors.black, 0.2)!;
    final themedFin = fin.copyWith(
      heroGradientStart: heroBase,
      heroGradientEnd: heroEnd,
      onHero: brightness == Brightness.light
          ? scheme.onPrimary
          : scheme.onPrimaryContainer,
      onHeroMuted: (brightness == Brightness.light
              ? scheme.onPrimary
              : scheme.onPrimaryContainer)
          .withValues(alpha: 0.78),
    );
    final base = ThemeData(colorScheme: scheme, useMaterial3: true);

    return base.copyWith(
      extensions: [themedFin],
      textTheme: FinType.textTheme(base.textTheme),
      scaffoldBackgroundColor: scheme.surface,

      appBarTheme: AppBarTheme(
        centerTitle: false,
        scrolledUnderElevation: 0.5,
        backgroundColor: scheme.surface,
        surfaceTintColor: scheme.surfaceTint,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
      ),

      // Outlined rather than elevated. Stacked shadows on a scrolling list of
      // financial cards read as clutter; a hairline border separates content
      // without adding visual weight to every row.
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        color: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: FinRadius.cardBorder,
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
      ),

      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: FinSpace.lg,
          vertical: FinSpace.xs,
        ),
        minVerticalPadding: FinSpace.md,
        shape: const RoundedRectangleBorder(borderRadius: FinRadius.cardBorder),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, FinTouch.minTarget),
          padding: const EdgeInsets.symmetric(horizontal: FinSpace.xl),
          shape:
              const RoundedRectangleBorder(borderRadius: FinRadius.pillBorder),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, FinTouch.minTarget),
          padding: const EdgeInsets.symmetric(horizontal: FinSpace.xl),
          shape:
              const RoundedRectangleBorder(borderRadius: FinRadius.pillBorder),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, FinTouch.minTarget),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: FinSpace.lg,
          vertical: FinSpace.lg,
        ),
        border: const OutlineInputBorder(
          borderRadius: FinRadius.cardBorder,
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: FinRadius.cardBorder,
          borderSide:
              BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: FinRadius.cardBorder,
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
        // Errors are stated in words, never by colouring the field alone.
        errorBorder: OutlineInputBorder(
          borderRadius: FinRadius.cardBorder,
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape:
            const RoundedRectangleBorder(borderRadius: FinRadius.sheetBorder),
        showDragHandle: true,
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: FinRadius.cardBorder),
      ),

      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        indicatorShape:
            const RoundedRectangleBorder(borderRadius: FinRadius.pillBorder),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          ),
        ),
      ),

      chipTheme: base.chipTheme.copyWith(
        shape: const RoundedRectangleBorder(borderRadius: FinRadius.pillBorder),
        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: FinRadius.cardBorder),
        insetPadding: const EdgeInsets.all(FinSpace.lg),
      ),

      dividerTheme: DividerThemeData(
        space: 1,
        thickness: 1,
        color: scheme.outlineVariant.withValues(alpha: 0.5),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        linearMinHeight: 8,
        borderRadius: const BorderRadius.all(FinRadius.pill),
        linearTrackColor: scheme.surfaceContainerHighest,
      ),
    );
  }
}
