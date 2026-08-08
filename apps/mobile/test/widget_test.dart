import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/main.dart';
import 'package:finverse/screens/login_screen.dart';

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

  testWidgets('rejects a short password before contacting the server', (tester) async {
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

  testWidgets('surfaces the server message when sign-in is rejected', (tester) async {
    final api = clientWith(MockClient((_) async => http.Response(
          '{"message":"Incorrect email or password."}',
          401,
        )));

    await tester.pumpWidget(FinverseApp(api: api));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'sam@example.com');
    await tester.enterText(find.byType(TextFormField).last, 'correct horse battery staple');
    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();

    expect(find.text('Incorrect email or password.'), findsOneWidget);
  });

  testWidgets('restores a stored session straight to the dashboard', (tester) async {
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

  testWidgets('refreshes once on 401, then retries the original call', (tester) async {
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
}
