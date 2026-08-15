import 'package:finverse/l10n/app_localizations.dart';
import 'package:finverse/models/models.dart';
import 'package:finverse/widgets/net_worth_history_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders a currency-safe accessible history chart',
      (tester) async {
    const points = [
      NetWorthSnapshot(
        recordedOn: '2026-08-01',
        currency: 'USD',
        assets: 200000,
        assetsFormatted: r'$2,000.00',
        debts: 50000,
        debtsFormatted: r'$500.00',
        netPosition: 150000,
        netPositionFormatted: r'$1,500.00',
      ),
      NetWorthSnapshot(
        recordedOn: '2026-08-15',
        currency: 'USD',
        assets: 220000,
        assetsFormatted: r'$2,200.00',
        debts: 40000,
        debtsFormatted: r'$400.00',
        netPosition: 180000,
        netPositionFormatted: r'$1,800.00',
      ),
    ];

    await tester.pumpWidget(const MaterialApp(
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: NetWorthHistoryChart(points: points)),
    ));

    expect(find.byKey(const Key('net-worth-history-chart')), findsOneWidget);
    expect(find.text(r'Current: $1,800.00'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp(r'2 observations.*\$1,800.00')),
      findsOneWidget,
    );
  });
}
