import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../api/app_lock.dart';
import 'budgets_screen.dart';
import 'bank_connections_screen.dart';
import 'dashboard_screen.dart';
import 'goals_screen.dart';
import 'transactions_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.onSignOut,
    required this.onAccountDeleted,
    this.appLockController,
    super.key,
  });

  final ApiClient api;
  final Future<void> Function() onSignOut;
  final Future<void> Function() onAccountDeleted;
  final AppLockController? appLockController;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  var _index = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: ValueListenableBuilder<DateTime?>(
          valueListenable: widget.api.offlineCacheStatus,
          builder: (context, cachedAt, _) => Column(
            children: [
              if (cachedAt != null)
                Material(
                  color: Theme.of(context).colorScheme.tertiaryContainer,
                  child: ListTile(
                    dense: true,
                    leading: const Icon(Icons.cloud_off_outlined),
                    title: const Text('Offline — showing saved data'),
                    subtitle: Text(
                      'Last updated ${DateFormat.yMMMd().add_jm().format(cachedAt.toLocal())}. Changes require a connection.',
                    ),
                  ),
                ),
              Expanded(
                child: IndexedStack(
                  index: _index,
                  children: [
                    DashboardScreen(
                      api: widget.api,
                      appLockController: widget.appLockController,
                      onSignOut: widget.onSignOut,
                      onAccountDeleted: widget.onAccountDeleted,
                    ),
                    TransactionsScreen(api: widget.api),
                    BudgetsScreen(api: widget.api),
                    GoalsScreen(api: widget.api),
                    BankConnectionsScreen(api: widget.api),
                  ],
                ),
              ),
            ],
          ),
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
            NavigationDestination(
                icon: Icon(Icons.flag_outlined), label: 'Goals'),
            NavigationDestination(
                icon: Icon(Icons.account_balance_outlined), label: 'Accounts'),
          ],
        ),
      );
}
