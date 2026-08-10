import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../api/app_lock.dart';
import 'bank_connections_screen.dart';
import 'dashboard_screen.dart';
import 'transactions_screen.dart';
import 'analytics_screen.dart';
import 'profile_screen.dart';

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
          builder: (context, cachedAt, _) => ValueListenableBuilder<int>(
            valueListenable: widget.api.pendingMutationCount,
            builder: (context, pending, _) => Column(
              children: [
                if (cachedAt != null || pending > 0)
                  Material(
                    color: Theme.of(context).colorScheme.tertiaryContainer,
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.cloud_off_outlined),
                      title: Text(pending > 0
                          ? 'Offline changes pending'
                          : 'Offline - showing saved data'),
                      subtitle: Text(pending > 0
                          ? '$pending change${pending == 1 ? '' : 's'} saved on this device and will sync automatically when you are online.'
                          : 'Last updated ${DateFormat.yMMMd().add_jm().format(cachedAt!.toLocal())}. Changes are read-only until you reconnect.'),
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
                      AnalyticsScreen(api: widget.api),
                      BankConnectionsScreen(api: widget.api),
                      ProfileScreen(
                        api: widget.api,
                        appLockController: widget.appLockController,
                        onSignOut: widget.onSignOut,
                        onAccountDeleted: widget.onAccountDeleted,
                      ),
                    ],
                  ),
                ),
              ],
            ),
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
                icon: Icon(Icons.insights_outlined), label: 'Analytics'),
            NavigationDestination(
                icon: Icon(Icons.account_balance_outlined), label: 'Accounts'),
            NavigationDestination(
                icon: Icon(Icons.person_outline), label: 'Profile'),
          ],
        ),
      );
}
