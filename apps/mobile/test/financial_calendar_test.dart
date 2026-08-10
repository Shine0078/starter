import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:finverse/api/client.dart';
import 'package:finverse/api/session_store.dart';
import 'package:finverse/screens/financial_calendar_screen.dart';

void main() {
  testWidgets('renders forecast events and low-balance warnings by date',
      (tester) async {
    final semantics = tester.ensureSemantics();
    final api = ApiClient(
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/accounts')) {
          return http.Response(
            '[{"id":"a1","name":"Chequing","type":"checking",'
            '"mask":"1234","currency":"USD","balanceCurrent":100000,'
            '"balanceFormatted":"\$1,000.00","source":"provider",'
            '"utilization":null}]',
            200,
          );
        }
        if (request.url.path.endsWith('/goals')) {
          return http.Response(
            '{"count":1,"goals":[{"goal":{"id":"g1",'
            '"name":"Emergency fund","targetAmount":500000,'
            '"currency":"USD","targetDate":"2026-08-20"},'
            '"savedAmount":100000,"remainingAmount":400000,'
            '"targetFormatted":"\$5,000.00","savedFormatted":"\$1,000.00",'
            '"remainingFormatted":"\$4,000.00","percentComplete":20,'
            '"suggestedMonthlyFormatted":"\$333.33",'
            '"projectedCompletionDate":null}]}',
            200,
          );
        }
        if (request.url.path.endsWith('/cash-flow-forecast')) {
          return http.Response(
            '{"asOf":"2026-08-08","currency":"USD",'
            '"startingBalance":100000,"startingBalanceFormatted":"\$1,000.00",'
            '"endingBalanceFormatted":"\$850.00",'
            '"lowBalanceDates":["2026-08-12"],'
            '"events":[{"date":"2026-08-12","amount":-15000,'
            '"merchant":"Internet","kind":"expense","confidence":0.92,'
            '"transactionIds":["txn-1"],"amountFormatted":"-\$150.00"}],'
            '"points":[{"date":"2026-08-09","balance":100000,'
            '"balanceFormatted":"\$1,000.00"},{"date":"2026-08-31",'
            '"balance":85000,"balanceFormatted":"\$850.00"}]}',
            200,
          );
        }
        return http.Response('{}', 404);
      }),
      baseUrl: 'http://localhost:9999',
      sessionStore: InMemorySessionStore(),
    );

    await tester.pumpWidget(MaterialApp(
      home: FinancialCalendarScreen(api: api),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Financial calendar'), findsOneWidget);
    expect(find.text('Next 90 days'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Internet')), findsOneWidget);
    expect(
        find.bySemanticsLabel(RegExp('projected low balance')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Emergency fund')), findsOneWidget);
    expect(find.byTooltip('Next month'), findsOneWidget);
    semantics.dispose();
  });
}
