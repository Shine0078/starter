import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/main.dart';
import 'package:finverse/models/models.dart';
import 'package:finverse/screens/home_screen.dart';
import 'package:finverse/screens/login_screen.dart';
import 'package:finverse/screens/transaction_detail_screen.dart';

/// An in-memory session store keeps these tests off the platform keystore,
/// which has no implementation in the widget-test host.
ApiClient clientWith(MockClient http, {SessionStore? store}) => ApiClient(
      httpClient: http,
      baseUrl: 'http://localhost:9999',
      sessionStore: store ?? InMemorySessionStore(),
    );

void main() {
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
    var requests = 0;
    final api = clientWith(MockClient((_) async {
      requests += 1;
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
    expect(requests, 0);
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
      if (path.endsWith('/insights')) {
        return http.Response(
          '{"headline":{"income":"\$0.00","expenses":"\$0.00","netCashFlow":"\$0.00","savingsRate":"0.0%"},"topCategories":[],"insights":[]}',
          200,
        );
      }
      return http.Response('{}', 200);
    }));

    await tester.pumpWidget(MaterialApp(
      home: HomeScreen(
        api: api,
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
