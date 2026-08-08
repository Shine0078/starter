import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/main.dart';

void main() {
  testWidgets('starts on the branded dashboard', (tester) async {
    await tester.pumpWidget(const FinverseApp());

    expect(find.text('FINVERSE'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
