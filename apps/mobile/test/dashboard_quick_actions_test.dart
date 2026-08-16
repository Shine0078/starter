import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/widgets/dashboard_quick_actions.dart';

void main() {
  testWidgets('empty dashboard offers clear next steps', (tester) async {
    final tapped = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: DashboardQuickActions(
          hasAccounts: false,
          onAccounts: () => tapped.add('accounts'),
          onTransactions: () => tapped.add('transactions'),
          onPlanning: () => tapped.add('planning'),
          onAnalytics: () => tapped.add('analytics'),
        ),
      ),
    ));

    expect(find.text('Start with one clear step'), findsOneWidget);
    expect(find.text('Connect an account'), findsOneWidget);
    expect(find.text('Review transactions'), findsOneWidget);
    expect(find.text('Plan cash flow'), findsOneWidget);
    expect(find.text('Explore reports'), findsOneWidget);

    await tester.tap(find.text('Connect an account'));
    await tester.tap(find.text('Plan cash flow'));
    expect(tapped, ['accounts', 'planning']);
  });

  testWidgets('connected dashboard changes the account action label',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: DashboardQuickActions(
          hasAccounts: true,
          onAccounts: () {},
          onTransactions: () {},
          onPlanning: () {},
          onAnalytics: () {},
        ),
      ),
    ));

    expect(find.text('Keep your plan moving'), findsOneWidget);
    expect(find.text('Manage accounts'), findsOneWidget);
    expect(find.text('Connect an account'), findsNothing);
  });
}
