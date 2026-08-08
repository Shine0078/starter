import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cryptography/cryptography.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/app_lock.dart';
import 'package:finverse/api/onboarding_store.dart';
import 'package:finverse/api/offline_cache.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/main.dart';
import 'package:finverse/models/models.dart';
import 'package:finverse/screens/home_screen.dart';
import 'package:finverse/screens/bank_connections_screen.dart';
import 'package:finverse/screens/login_screen.dart';
import 'package:finverse/screens/transaction_detail_screen.dart';
import 'package:finverse/widgets/budget_tile.dart';
import 'package:finverse/widgets/health_score_card.dart';
import 'package:finverse/widgets/net_position_card.dart';
import 'package:finverse/widgets/spending_chart.dart';

/// An in-memory session store keeps these tests off the platform keystore,
/// which has no implementation in the widget-test host.
ApiClient clientWith(MockClient http,
        {SessionStore? store, OfflineCacheStore? offlineCache}) =>
    ApiClient(
      httpClient: http,
      baseUrl: 'http://localhost:9999',
      sessionStore: store ?? InMemorySessionStore(),
      offlineCache: offlineCache,
    );

class FakeDeviceAuthenticator implements DeviceAuthenticator {
  FakeDeviceAuthenticator({this.supported = true, this.result = true});

  bool supported;
  bool result;
  int calls = 0;

  @override
  Future<bool> authenticate(String reason) async {
    calls += 1;
    return result;
  }

  @override
  Future<bool> isSupported() async => supported;
}

void main() {
  testWidgets('net position never mixes currencies and exposes chart semantics',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: NetPositionCard(accounts: [
          Account(
            id: 'cad-chequing',
            name: 'Chequing',
            type: 'checking',
            mask: '1234',
            currency: 'CAD',
            balanceCurrent: 250000,
            balanceFormatted: r'$2,500.00',
          ),
          Account(
            id: 'cad-card',
            name: 'Card',
            type: 'credit_card',
            mask: '4321',
            currency: 'CAD',
            balanceCurrent: -50000,
            balanceFormatted: r'-$500.00',
          ),
          Account(
            id: 'usd-savings',
            name: 'US savings',
            type: 'savings',
            mask: '9876',
            currency: 'USD',
            balanceCurrent: 100000,
            balanceFormatted: r'$1,000.00',
          ),
        ]),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('CAD'), findsOneWidget);
    expect(find.text('USD'), findsOneWidget);
    expect(
      find.text(
          'Currencies are shown separately; no estimated exchange rate is applied.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(RegExp(r'^CAD net position')),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(RegExp(r'^USD net position')),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets(
      'financial visuals have spoken equivalents and survive 200% text scaling',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(400, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Scaffold(
          body: SingleChildScrollView(
            child: Column(children: [
              SpendingChart(categories: [
                CategorySpend(
                  categorySlug: 'groceries',
                  categoryName: 'Groceries',
                  total: 12550,
                  totalFormatted: r'$125.50',
                  transactionCount: 4,
                ),
              ]),
              BudgetTile(
                progress: BudgetProgress(
                  budgetId: 'budget-groceries',
                  categorySlug: 'groceries',
                  categoryName: 'Groceries',
                  spentFormatted: r'$125.50',
                  limitFormatted: r'$300.00',
                  remainingFormatted: r'$174.50',
                  percentUsed: 41.8,
                  status: 'on_track',
                  daysRemaining: 12,
                  projectedToExceed: false,
                ),
              ),
              HealthScoreCard(
                score: HealthScore(
                  score: 742,
                  band: 'good',
                  components: [
                    ScoreComponent(
                      key: 'cash_flow',
                      label: 'Cash flow',
                      points: 160,
                      maxPoints: 200,
                      detail: 'Income is above expenses.',
                    ),
                  ],
                  topActions: const [],
                ),
              ),
            ]),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(
      find.bySemanticsLabel(r'Groceries: $125.50 across 4 transactions.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(
          r'Groceries budget. $125.50 spent of $300.00. 42 percent used. $174.50 left. 12 days left.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel('Financial health score 742 out of 1000, good.'),
      findsOneWidget,
    );
    expect(
      find.bySemanticsLabel(
          'Cash flow: 160 of 200 points. Income is above expenses.'),
      findsOneWidget,
    );
    semantics.dispose();
  });

  test('device app lock authenticates before enable and after backgrounding',
      () async {
    final authenticator = FakeDeviceAuthenticator();
    final controller = AppLockController(
      store: InMemoryAppLockStore(),
      authenticator: authenticator,
    );

    await controller.initialize();
    expect(controller.enabled, isFalse);
    expect(await controller.setEnabled(true), AppLockChangeResult.changed);
    expect(controller.enabled, isTrue);
    expect(authenticator.calls, 1);

    controller.lock();
    expect(controller.locked, isTrue);
    expect(await controller.unlock(), isTrue);
    expect(controller.locked, isFalse);
    expect(authenticator.calls, 2);
  });

  testWidgets(
      'app lock hides financial UI until device authentication succeeds',
      (tester) async {
    final authenticator = FakeDeviceAuthenticator(result: false);
    final controller = AppLockController(
      store: InMemoryAppLockStore(enabled: true),
      authenticator: authenticator,
    );
    await controller.initialize();

    await tester.pumpWidget(MaterialApp(
      home: AppLockGate(
        controller: controller,
        onSignOut: () async {},
        child: const Text('Sensitive financial dashboard'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('FINVERSE is locked'), findsOneWidget);
    expect(find.text('Sensitive financial dashboard'), findsNothing);
    authenticator.result = true;
    await tester.tap(find.text('Unlock FINVERSE'));
    await tester.pumpAndSettle();
    expect(find.text('Sensitive financial dashboard'), findsOneWidget);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(find.text('FINVERSE is locked'), findsOneWidget);
    expect(find.text('Sensitive financial dashboard'), findsNothing);
  });

  test('offline payload encryption authenticates ciphertext and context',
      () async {
    final cipher = OfflineCachePayloadCipher();
    final key = SecretKey(List<int>.generate(32, (index) => index));
    final envelope = await cipher.encrypt('financial-data', key, [1, 2, 3]);

    expect(await cipher.decrypt(envelope, key, [1, 2, 3]), 'financial-data');
    final tampered = EncryptedCacheEnvelope(
      nonce: envelope.nonce,
      mac: envelope.mac,
      ciphertext: [...envelope.ciphertext]..[0] = envelope.ciphertext[0] ^ 1,
    );
    await expectLater(
      cipher.decrypt(tampered, key, [1, 2, 3]),
      throwsA(anything),
    );
    await expectLater(
      cipher.decrypt(envelope, key, [9, 9, 9]),
      throwsA(anything),
    );
  });

  test('falls back to user-scoped cached reads and purges them on sign-out',
      () async {
    final store = InMemorySessionStore();
    final cache = InMemoryOfflineCacheStore();
    await store.write(const SessionTokens(
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshExpiresAt: '2026-09-08T00:00:00.000Z',
      userId: 'user-1',
    ));
    var requests = 0;
    final api = clientWith(
      MockClient((request) async {
        requests++;
        if (request.method == 'POST') throw http.ClientException('offline');
        if (requests == 1) return http.Response('[]', 200);
        throw http.ClientException('offline');
      }),
      store: store,
      offlineCache: cache,
    );
    await api.restoreSession();

    expect(await api.accounts(), isEmpty);
    api.resetOfflineStatus();
    expect(await api.accounts(), isEmpty);
    expect(api.usedOfflineCache, isTrue);

    await api.signOut();
    expect(await cache.read('user-1', '/accounts'), isNull);
  });

  test('portable export confirms the password and attaches the active session',
      () async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'active-access',
      refreshToken: 'active-refresh',
      refreshExpiresAt: '2026-09-08T00:00:00.000Z',
      userId: 'user-1',
    ));
    late http.Request seen;
    final api = clientWith(MockClient((request) async {
      seen = request;
      return http.Response('{"format":"finverse-portable-export"}', 200);
    }), store: store);
    await api.restoreSession();

    final exported = await api.exportData('correct horse battery staple');

    expect(exported, contains('finverse-portable-export'));
    expect(seen.headers['authorization'], 'Bearer active-access');
    expect(seen.body, contains('correct horse battery staple'));
  });

  testWidgets('first launch explains the product before sign-in',
      (tester) async {
    final api = clientWith(MockClient((_) async => http.Response('{}', 200)));
    final onboarding = InMemoryOnboardingStore();

    await tester.pumpWidget(
      FinverseApp(api: api, onboardingStore: onboarding),
    );
    await tester.pumpAndSettle();

    expect(find.text('See your money clearly'), findsOneWidget);
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsWidgets);
    expect(await onboarding.isComplete(), isTrue);
  });

  testWidgets('shows sign-in when there is no stored session', (tester) async {
    final api = clientWith(MockClient((_) async => http.Response('{}', 200)));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('FINVERSE'), findsOneWidget);
    expect(find.text('Sign in'), findsWidgets);
  });

  testWidgets('toggles between sign in and registration', (tester) async {
    final api = clientWith(MockClient((_) async => http.Response('{}', 200)));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('At least 12 characters'), findsOneWidget);
  });

  testWidgets('rejects a short password before contacting the server',
      (tester) async {
    var registrationRequests = 0;
    final api = clientWith(MockClient((request) async {
      if (!request.url.path.endsWith('/legal')) registrationRequests += 1;
      return http.Response('{}', 200);
    }));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'sam@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'short');
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();

    expect(find.text('Use at least 12 characters.'), findsOneWidget);
    expect(registrationRequests, 0);
  });

  testWidgets('requires both configured legal documents before registration',
      (tester) async {
    final api = clientWith(MockClient((request) async {
      if (request.url.path.endsWith('/legal')) {
        return http.Response(
          '{"registrationRequired":true,"terms":{"version":"terms-v1","url":"https://finverse.example/terms-v1"},"privacyNotice":{"version":"privacy-v1","url":"https://finverse.example/privacy-v1"}}',
          200,
        );
      }
      return http.Response('{}', 200);
    }));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();

    expect(find.text('I accept the Terms of Service'), findsOneWidget);
    expect(find.text('I acknowledge the Privacy Notice'), findsOneWidget);
    expect(find.text('Read Terms (terms-v1)'), findsOneWidget);
    expect(find.text('Read Privacy Notice (privacy-v1)'), findsOneWidget);

    FilledButton create =
        tester.widget(find.widgetWithText(FilledButton, 'Create account'));
    expect(create.onPressed, isNull);
    await tester.tap(find.byType(Checkbox).at(0));
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pump();
    create = tester.widget(find.widgetWithText(FilledButton, 'Create account'));
    expect(create.onPressed, isNotNull);
  });

  testWidgets('bank linking requires FINVERSE password step-up',
      (tester) async {
    http.Request? linkRequest;
    final api = clientWith(MockClient((request) async {
      if (request.method == 'GET' && request.url.path.endsWith('/bank-links')) {
        return http.Response('{"count":0,"links":[]}', 200);
      }
      if (request.url.path.endsWith('/bank-links/link-token')) {
        linkRequest = request;
        return http.Response('{"message":"not configured"}', 503);
      }
      return http.Response('{}', 200);
    }));

    await tester.pumpWidget(MaterialApp(home: BankConnectionsScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connect bank'));
    await tester.pumpAndSettle();

    expect(find.text('Confirm it’s you'), findsOneWidget);
    expect(find.text('FINVERSE password'), findsOneWidget);
    await tester.enterText(
        find.byType(TextField).last, 'correct horse battery staple');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(linkRequest, isNotNull);
    expect(linkRequest!.body, contains('correct horse battery staple'));
  });

  testWidgets('surfaces the server message when sign-in is rejected',
      (tester) async {
    final api = clientWith(MockClient((_) async => http.Response(
          '{"message":"Incorrect email or password."}',
          401,
        )));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'sam@example.com');
    await tester.enterText(
        find.byType(TextFormField).last, 'correct horse battery staple');
    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();

    expect(find.text('Incorrect email or password.'), findsOneWidget);
  });

  testWidgets('completes an authenticator challenge before signing in',
      (tester) async {
    var signedIn = false;
    http.Request? verification;
    final api = clientWith(MockClient((request) async {
      if (request.url.path.endsWith('/auth/login')) {
        return http.Response(
          '{"mfaRequired":true,"challengeToken":"opaque-challenge","expiresAt":"2026-08-08T13:00:00.000Z"}',
          200,
        );
      }
      verification = request;
      return http.Response(
        '{"user":{"id":"user-1","email":"sam@example.com","emailVerified":true},"tokens":{"accessToken":"access","refreshToken":"refresh","refreshExpiresAt":"2026-09-08T00:00:00.000Z"}}',
        200,
      );
    }));

    await tester.pumpWidget(MaterialApp(
      home: LoginScreen(api: api, onSignedIn: () => signedIn = true),
    ));
    await tester.enterText(find.byType(TextFormField).first, 'sam@example.com');
    await tester.enterText(
        find.byType(TextFormField).last, 'correct horse battery staple');
    await tester.tap(find.text('Sign in').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Verify it\'s you'), findsOneWidget);
    expect(signedIn, isFalse);
    await tester.enterText(find.byType(TextField).last, '123456');
    await tester.tap(find.text('Verify'));
    await tester.pumpAndSettle();

    expect(signedIn, isTrue);
    expect(verification?.url.path, endsWith('/auth/mfa/verify'));
    expect(verification?.body, contains('opaque-challenge'));
    expect(verification?.body, contains('123456'));
  });

  testWidgets('restores a stored session straight to the dashboard',
      (tester) async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      refreshExpiresAt: '',
    ));

    // Every dashboard call returns an empty payload; the point is which screen
    // renders, not what it renders.
    final api = clientWith(
      MockClient((request) async {
        if (request.url.path.endsWith('/auth/me')) {
          return http.Response('{"id":"u1","email":"sam@example.com"}', 200);
        }
        return http.Response('{"transactions":[],"budgets":[],"count":0}', 200);
      }),
      store: store,
    );

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pump();

    expect(find.byType(LoginScreen), findsNothing);
  });

  testWidgets('attaches the bearer token to API calls', (tester) async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      refreshExpiresAt: '',
    ));

    String? seenAuthorization;
    final api = clientWith(
      MockClient((request) async {
        seenAuthorization ??= request.headers['authorization'];
        return http.Response('[]', 200);
      }),
      store: store,
    );

    await api.restoreSession();
    await api.accounts();

    expect(seenAuthorization, 'Bearer stored-access');
  });

  testWidgets('refreshes once on 401, then retries the original call',
      (tester) async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'expired',
      refreshToken: 'good-refresh',
      refreshExpiresAt: '',
    ));

    final calls = <String>[];
    final api = clientWith(
      MockClient((request) async {
        calls.add('${request.method} ${request.url.path}');

        if (request.url.path.endsWith('/auth/refresh')) {
          return http.Response(
            '{"tokens":{"accessToken":"fresh","refreshToken":"next","refreshExpiresAt":""}}',
            200,
          );
        }
        // Reject the stale token once, accept the refreshed one.
        if (request.headers['authorization'] == 'Bearer expired') {
          return http.Response('{"message":"expired"}', 401);
        }
        return http.Response('[]', 200);
      }),
      store: store,
    );

    await api.restoreSession();
    final accounts = await api.accounts();

    expect(accounts, isEmpty);
    expect(calls.where((c) => c.contains('/auth/refresh')), hasLength(1));
    // Original call, refresh, retry — not an endless loop.
    expect(calls, hasLength(3));
  });

  test(
      'account deletion is confirmed server-side before credentials are cleared',
      () async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'active-access',
      refreshToken: 'active-refresh',
      refreshExpiresAt: '',
    ));

    late http.Request seen;
    final api = clientWith(
      MockClient((request) async {
        seen = request;
        return http.Response(
          '{"purgeScheduledFor":"2026-09-07T00:00:00.000Z"}',
          202,
        );
      }),
      store: store,
    );
    await api.restoreSession();

    final scheduled = await api.requestAccountDeletion('my current password');

    expect(seen.method, 'DELETE');
    expect(seen.url.path, '/api/auth/account');
    expect(seen.headers['authorization'], 'Bearer active-access');
    expect(seen.body, contains('"confirmation":"DELETE"'));
    expect(scheduled.toUtc().toIso8601String(), '2026-09-07T00:00:00.000Z');
    expect(await store.read(), isNull);
    expect(api.isAuthenticated, isFalse);
  });

  testWidgets('offers recovery for a scheduled account deletion',
      (tester) async {
    final api = clientWith(MockClient((_) async => http.Response('{}', 200)));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel scheduled account deletion'));
    await tester.pumpAndSettle();

    expect(find.text('Restore your account'), findsOneWidget);
    expect(find.text('Restore account'), findsOneWidget);
    expect(find.text('Back to sign in'), findsOneWidget);
  });

  testWidgets('shows transaction evidence and category controls',
      (tester) async {
    final api = clientWith(MockClient((request) async {
      if (request.url.path.endsWith('/categories')) {
        return http.Response(
          '{"count":2,"categories":[{"slug":"food","name":"Food","parent":null,"kind":"expense"},{"slug":"groceries","name":"Groceries","parent":"food","kind":"expense"}]}',
          200,
        );
      }
      return http.Response('{}', 200);
    }));
    final transaction = Transaction.fromJson({
      'id': 'txn-1',
      'accountId': 'account-1',
      'postedAt': '2026-08-08',
      'amount': -1299,
      'currency': 'CAD',
      'amountFormatted': '-\$12.99',
      'rawDescriptor': 'POS GROCERY STORE 1234',
      'normalizedDescriptor': 'grocery store',
      'merchant': 'Grocery Store',
      'categorySlug': 'groceries',
      'categorySource': 'merchant_rule',
      'categoryConfidence': 0.91,
      'pending': false,
      'isRecurring': false,
    });

    await tester.pumpWidget(MaterialApp(
      home: TransactionDetailScreen(api: api, transaction: transaction),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Transaction details'), findsOneWidget);
    expect(find.text('Grocery Store'), findsOneWidget);
    expect(find.text('Bank description'), findsOneWidget);
    expect(find.textContaining('91% confidence'), findsOneWidget);
  });

  testWidgets('navigates to transactions, budgets, and goals', (tester) async {
    final api = clientWith(MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/sync')) {
        return http.Response(
          '{"accounts":0,"fetched":0,"inserted":0,"updated":0,"coverage":0,"needsReview":0}',
          201,
        );
      }
      if (path.endsWith('/accounts')) return http.Response('[]', 200);
      if (path.endsWith('/health-score')) {
        return http.Response(
          '{"score":500,"band":"fair","components":[],"topActions":[]}',
          200,
        );
      }
      if (path.endsWith('/budgets/progress')) {
        return http.Response('{"budgets":[],"count":0}', 200);
      }
      if (path.endsWith('/transactions')) {
        return http.Response('{"transactions":[],"count":0}', 200);
      }
      if (path.endsWith('/goals')) {
        return http.Response('{"goals":[],"count":0}', 200);
      }
      if (path.endsWith('/notifications/preferences')) {
        return http.Response(
          '{"budget":true,"bills":true,"creditUtilization":true,"subscriptions":true,"lowBalance":true,"unusualTransactions":true,"bankSync":true,"security":true}',
          200,
        );
      }
      if (path.endsWith('/notifications')) {
        return http.Response('{"notifications":[],"count":0,"unread":0}', 200);
      }
      if (path.endsWith('/subscriptions')) {
        return http.Response(
          '{"count":0,"monthlyTotalFormatted":"\$0.00","annualTotalFormatted":"\$0.00","subscriptions":[],"priceIncreases":[],"possiblyCancelled":[]}',
          200,
        );
      }
      if (path.endsWith('/auth/me')) {
        return http.Response(
          '{"id":"user-1","email":"sam@example.com","emailVerified":true}',
          200,
        );
      }
      if (path.endsWith('/auth/sessions')) {
        return http.Response(
          '[{"id":"session-1","issuedAt":"2026-08-08T00:00:00.000Z","expiresAt":"2026-09-08T00:00:00.000Z","lastUsedAt":"2026-08-08T00:00:00.000Z","userAgent":"FINVERSE Android","ipAddress":"127.0.0.1","current":true}]',
          200,
        );
      }
      if (path.endsWith('/auth/mfa')) {
        return http.Response(
          '{"enabled":false,"available":true,"recoveryCodesRemaining":0}',
          200,
        );
      }
      if (path.endsWith('/privacy')) {
        return http.Response(
          '{"user":{"id":"user-1","email":"sam@example.com","emailVerified":true},"optionalConsents":{"analytics":{"granted":false,"policyVersion":"preference-v1","updatedAt":null},"productUpdates":{"granted":false,"policyVersion":"preference-v1","updatedAt":null}},"consentHistory":[],"securityActivity":[{"id":"event-1","kind":"login","succeeded":true,"ipAddress":"127.0.0.1","userAgent":"FINVERSE Android","detail":null,"createdAt":"2026-08-08T00:00:00.000Z"}],"retention":{"accountDeletionRecoveryDays":30,"offlineCacheMaximumDays":30}}',
          200,
        );
      }
      if (path.endsWith('/insights')) {
        return http.Response(
          '{"headline":{"income":"\$0.00","expenses":"\$0.00","netCashFlow":"\$0.00","savingsRate":"0.0%"},"topCategories":[],"insights":[]}',
          200,
        );
      }
      return http.Response('{}', 200);
    }));

    final appLock = AppLockController(
      store: InMemoryAppLockStore(),
      authenticator: FakeDeviceAuthenticator(),
    );
    await appLock.initialize();
    await tester.pumpWidget(MaterialApp(
      home: HomeScreen(
        api: api,
        appLockController: appLock,
        onSignOut: () async {},
        onAccountDeleted: () async {},
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Notifications'));
    await tester.pumpAndSettle();
    expect(find.text('You are all caught up'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Subscriptions'));
    await tester.pumpAndSettle();
    expect(find.text('No recurring subscriptions detected.'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Account menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings & privacy'));
    await tester.pumpAndSettle();
    expect(find.text('sam@example.com'), findsOneWidget);
    expect(find.text('This device'), findsOneWidget);
    expect(find.text('Authenticator security'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Device app lock'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(find.text('Device app lock'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Usage analytics'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(find.text('Usage analytics'), findsOneWidget);
    expect(find.text('Export my data'), findsOneWidget);
    expect(find.text('Monthly financial report'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('RECENT SECURITY ACTIVITY'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(find.text('RECENT SECURITY ACTIVITY'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Transactions'));
    await tester.pumpAndSettle();
    expect(find.text('Search merchant or description'), findsOneWidget);
    expect(find.text('No matching transactions.'), findsOneWidget);

    await tester.tap(find.text('Budgets'));
    await tester.pumpAndSettle();
    expect(find.text('New budget'), findsOneWidget);
    expect(find.text('Create a budget to start tracking progress.'),
        findsOneWidget);

    await tester.tap(find.text('Goals'));
    await tester.pumpAndSettle();
    expect(find.text('New goal'), findsOneWidget);
    expect(find.text('Create a goal and turn saving into a plan.'),
        findsOneWidget);
  });
}
