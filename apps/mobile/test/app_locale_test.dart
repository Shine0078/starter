import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/app_locale.dart';
import 'package:finverse/l10n/app_localizations.dart';
import 'package:finverse/screens/assistant_screen.dart';
import 'package:finverse/screens/bank_connections_screen.dart';

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
}
