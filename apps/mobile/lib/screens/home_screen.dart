import 'package:flutter/material.dart';

import '../api/client.dart';
import 'budgets_screen.dart';
import 'dashboard_screen.dart';
import 'transactions_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.onSignOut,
    required this.onAccountDeleted,
    super.key,
  });

  final ApiClient api;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onAccountDeleted;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  var _index = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _index,
          children: [
            DashboardScreen(
              api: widget.api,
              onSignOut: widget.onSignOut,
              onAccountDeleted: widget.onAccountDeleted,
            ),
            TransactionsScreen(api: widget.api),
            BudgetsScreen(api: widget.api),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (index) => setState(() => _index = index),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined), label: 'Home'),
            NavigationDestination(
                icon: Icon(Icons.receipt_long_outlined), label: 'Transactions'),
            NavigationDestination(
                icon: Icon(Icons.pie_chart_outline), label: 'Budgets'),
          ],
        ),
      );
}
