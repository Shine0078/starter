import 'package:flutter/material.dart';

import 'api/client.dart';
import 'screens/dashboard_screen.dart';

void main() => runApp(const FinverseApp());

class FinverseApp extends StatelessWidget {
  const FinverseApp({super.key});

  @override
  Widget build(BuildContext context) {
    final seed = const Color(0xFF2F6DF6);

    return MaterialApp(
      title: 'FINVERSE',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      // Follow the OS. A finance app opened at night should not flashbang you.
      themeMode: ThemeMode.system,
      home: DashboardScreen(api: ApiClient()),
    );
  }
}
