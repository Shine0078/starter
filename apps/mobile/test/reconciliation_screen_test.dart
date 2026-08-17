import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/screens/reconciliation_screen.dart';

/// Signed-in client whose HTTP layer is scripted per path.
Future<ApiClient> clientFor(
  Map<String, Object> responses, {
  void Function(http.BaseRequest request)? onRequest,
}) async {
  final store = InMemorySessionStore();
  await store.write(const SessionTokens(
    accessToken: 'access',
    refreshToken: 'refresh',
    refreshExpiresAt: '',
  ));

  final api = ApiClient(
    baseUrl: 'http://localhost:9999',
    sessionStore: store,
    httpClient: MockClient((request) async {
      onRequest?.call(request);
      for (final entry in responses.entries) {
        if (request.url.path.contains(entry.key)) {
          return http.Response(jsonEncode(entry.value), 200);
        }
      }
      return http.Response('{}', 200);
    }),
  );

  await api.restoreSession();
  return api;
}

const _summary = {
  'count': 1,
  'overdue': 1,
  'accounts': [
    {
      'accountId': 'acc_checking',
      'accountName': 'Everyday Checking',
      'currency': 'USD',
      'currentBalance': 100000,
      'currentBalanceFormatted': r'$1,000.00',
      'overdue': true,
      'lastStatementDate': null,
      'lastDifference': null,
      'lastDifferenceFormatted': null,
      'daysSinceReconciled': null,
    }
  ],
};

void main() {
  testWidgets('shows an account that has never been checked as overdue', (tester) async {
    final api = await clientFor({
      'reconciliations/summary': _summary,
      'reconciliations': {'count': 0, 'reconciliations': []},
    });

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Everyday Checking'), findsOneWidget);
    expect(find.text('Never checked'), findsOneWidget);
    expect(find.text('Check balance'), findsOneWidget);
  });

  testWidgets('states plainly that transactions are never altered', (tester) async {
    // The promise is the product here: an app that silently inserts a balancing
    // entry destroys the discrepancy the user needed to see.
    final api = await clientFor({
      'reconciliations/summary': _summary,
      'reconciliations': {'count': 0, 'reconciliations': []},
    });

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('never changes your transactions'),
      findsOneWidget,
    );
  });

  testWidgets('previews before recording, and does not POST on compare', (tester) async {
    final methods = <String>[];

    final api = await clientFor(
      {
        'reconciliations/summary': _summary,
        'reconciliations/preview': {
          'computedBalance': 105000,
          'difference': -5000,
          'status': 'unbalanced',
          'explanation': 'FINVERSE recorded \$50.00 more than the account held.',
          'transactionsConsidered': 3,
          'computedFormatted': r'$1,050.00',
          'differenceFormatted': r'-$50.00',
          'accountName': 'Everyday Checking',
          'currency': 'USD',
        },
        'reconciliations': {'count': 0, 'reconciliations': []},
      },
      onRequest: (request) => methods.add('${request.method} ${request.url.path}'),
    );

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Check balance'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Closing balance'), '1000.00');
    await tester.tap(find.text('Compare'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Off by'), findsOneWidget);
    expect(find.text('Save this check'), findsOneWidget);

    // Comparing must not write anything.
    expect(methods.any((m) => m.startsWith('POST /api/reconciliations')), isFalse);
  });

  testWidgets('rejects an unparseable balance before calling the API', (tester) async {
    final paths = <String>[];

    final api = await clientFor(
      {
        'reconciliations/summary': _summary,
        'reconciliations': {'count': 0, 'reconciliations': []},
      },
      onRequest: (request) => paths.add(request.url.path),
    );

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Check balance'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Closing balance'), '..');
    await tester.tap(find.text('Compare'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Enter the balance as a number'), findsOneWidget);
    expect(paths.any((p) => p.contains('preview')), isFalse);
  });

  testWidgets('shows a withdrawn check without removing it from history', (tester) async {
    final api = await clientFor({
      'reconciliations/summary': _summary,
      'reconciliations': {
        'count': 1,
        'reconciliations': [
          {
            'id': 'rec1',
            'accountId': 'acc_checking',
            'accountName': 'Everyday Checking',
            'statementDate': '2026-07-31',
            'observedBalance': 100000,
            'computedBalance': 100000,
            'difference': 0,
            'observedFormatted': r'$1,000.00',
            'computedFormatted': r'$1,000.00',
            'differenceFormatted': r'$0.00',
            'status': 'balanced',
            'source': 'statement',
            'createdAt': '2026-08-01T00:00:00.000Z',
            'note': null,
            'archivedAt': '2026-08-02T00:00:00.000Z',
          }
        ],
      },
    });

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    // An audit trail you can erase is not one, so it stays visible and labelled.
    expect(find.text('Withdrawn'), findsOneWidget);
    expect(find.textContaining('2026-07-31'), findsOneWidget);
  });

  testWidgets('surfaces a load failure instead of an empty screen', (tester) async {
    final store = InMemorySessionStore();
    await store.write(const SessionTokens(
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshExpiresAt: '',
    ));

    final api = ApiClient(
      baseUrl: 'http://localhost:9999',
      sessionStore: store,
      httpClient: MockClient((_) async => http.Response('{"message":"boom"}', 500)),
    );
    await api.restoreSession();

    await tester.pumpWidget(MaterialApp(home: ReconciliationScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text("Couldn't load balance checks"), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
