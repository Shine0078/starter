import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/app_locale.dart';
import 'package:finverse/app_theme.dart';
import 'package:finverse/design/theme.dart';
import 'package:finverse/l10n/app_localizations.dart';
import 'package:finverse/screens/assistant_screen.dart';
import 'package:finverse/screens/bank_connections_screen.dart';
import 'package:finverse/screens/help_support_screen.dart';

void main() {
  test('restores only a supported persisted display language', () async {
    final store = InMemoryLocalePreferenceStore()..languageCode = 'fr';
    final controller = LocaleController.inMemory(store: store);

    await controller.restore();

    expect(controller.locale, const Locale('fr'));
  });

  test('ignores a stale unsupported display language', () async {
    final store = InMemoryLocalePreferenceStore()..languageCode = 'es';
    final controller = LocaleController.inMemory(store: store);

    await controller.restore();

    expect(controller.locale, isNull);
  });

  test('persists an explicit language and can return to device language',
      () async {
    final store = InMemoryLocalePreferenceStore();
    final controller = LocaleController.inMemory(store: store);

    await controller.select(const Locale('fr'));
    expect(controller.locale, const Locale('fr'));
    expect(store.languageCode, 'fr');

    await controller.select(null);
    expect(controller.locale, isNull);
    expect(store.languageCode, isNull);
  });

  test('refuses a locale the app has not translated', () async {
    final controller = LocaleController.inMemory();

    await expectLater(
      controller.select(const Locale('es')),
      throwsArgumentError,
    );
  });

  test('restores a selected theme color and custom color', () async {
    final store = InMemoryThemeColorPreferenceStore()
      ..themeColor = FinThemeColors.custom
      ..customColor = const Color(0xFF123456).toARGB32();
    final controller = ThemeColorController.inMemory(store: store);

    await controller.restore();

    expect(controller.selected, FinThemeColors.custom);
    expect(controller.color, const Color(0xFF123456));
  });

  test('persists preset and custom theme color choices', () async {
    final store = InMemoryThemeColorPreferenceStore();
    final controller = ThemeColorController.inMemory(store: store);

    await controller.selectPreset(FinThemeColors.indigo);
    expect(controller.color, FinThemeColors.preset(FinThemeColors.indigo));
    expect(store.themeColor, FinThemeColors.indigo);

    await controller.selectCustom(const Color(0xFFABCDEF));
    expect(controller.selected, FinThemeColors.custom);
    expect(controller.color, const Color(0xFFABCDEF));
    expect(store.customColor, const Color(0xFFABCDEF).toARGB32());
  });

  test('selected theme color changes the Material color scheme', () {
    final emerald =
        FinTheme.light(FinThemeColors.preset(FinThemeColors.emerald));
    final indigo = FinTheme.light(FinThemeColors.preset(FinThemeColors.indigo));

    expect(emerald.colorScheme.primary, isNot(indigo.colorScheme.primary));
  });

  test('restores and persists the light/dark appearance preference', () async {
    final store = InMemoryThemeModePreferenceStore()..themeMode = 'dark';
    final controller = ThemeModeController.inMemory(store: store);

    await controller.restore();
    expect(controller.mode, ThemeMode.dark);

    await controller.select(ThemeMode.light);
    expect(controller.mode, ThemeMode.light);
    expect(store.themeMode, 'light');

    await controller.select(ThemeMode.system);
    expect(store.themeMode, 'system');
  });

  testWidgets('applies a selected language across the app scope',
      (tester) async {
    final controller = LocaleController.inMemory();

    await tester.pumpWidget(
      ListenableBuilder(
        listenable: controller,
        builder: (context, _) => MaterialApp(
          locale: controller.locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => LocaleControllerScope(
            controller: controller,
            child: child ?? const SizedBox.shrink(),
          ),
          home: Builder(
            builder: (context) => Text(AppLocalizations.of(context).navHome),
          ),
        ),
      ),
    );
    expect(find.text('Home'), findsOneWidget);

    await controller.select(const Locale('fr'));
    await tester.pumpAndSettle();

    expect(find.text('Accueil'), findsOneWidget);
  });

  testWidgets('localizes the finance guide prompt content', (tester) async {
    final api = ApiClient(
      baseUrl: 'http://example.com',
      sessionStore: InMemorySessionStore(),
    );
    addTearDown(api.close);

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('fr'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: AssistantScreen(api: api),
      ),
    );

    expect(find.text('Demander à FINVERSE'), findsOneWidget);
    expect(find.text('Une vision claire de votre argent'), findsOneWidget);
    expect(find.text('Essayez une de ces questions'), findsOneWidget);
  });

  testWidgets('localizes the bank account-management path', (tester) async {
    final api = ApiClient(
      baseUrl: 'http://example.com',
      sessionStore: InMemorySessionStore(),
    );
    addTearDown(api.close);

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('fr'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BankConnectionsScreen(api: api),
      ),
    );

    expect(find.text('Comptes'), findsOneWidget);
    expect(find.text('Ajouter manuellement'), findsOneWidget);
  });

  testWidgets('localizes the support and recovery centre', (tester) async {
    final api = ApiClient(
      baseUrl: 'http://example.com',
      sessionStore: InMemorySessionStore(),
    );
    addTearDown(api.close);

    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('fr'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: HelpSupportScreen(api: api),
      ),
    );

    expect(find.text('Aide et assistance'), findsOneWidget);
    expect(find.text('QUESTIONS COURANTES'), findsOneWidget);
  });
}
