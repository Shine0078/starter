import 'package:flutter/material.dart';

import '../api/app_lock.dart';
import '../api/client.dart';
import 'analytics_screen.dart';
import 'financial_calendar_screen.dart';
import 'goals_screen.dart';
import 'budgets_screen.dart';
import 'notifications_screen.dart';
import 'planning_screen.dart';
import 'settings_screen.dart';
import 'subscriptions_screen.dart';

/// Secondary navigation hub for features that should not compete with the
/// five primary destinations in the app shell.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({
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

  Future<void> _requestVerification(BuildContext context) async {
    try {
      await api.requestEmailVerification();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Verification email sent.')),
        );
      }
    } on AuthException catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.displayMessage)),
        );
      }
    }
  }

  void _open(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: const Text('Settings and privacy'),
                subtitle: const Text(
                    'Security, MFA, app lock, consent, export, and account controls'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _open(
                  context,
                  SettingsScreen(
                    api: api,
                    appLockController: appLockController,
                    onVerifyEmail: () => _requestVerification(context),
                    onSignOut: onSignOut,
                    onDeleteAccount: onAccountDeleted,
                    onSignedOutEverywhere: onSignOut,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            _section(context, 'Planning', [
              _destination(
                context,
                icon: Icons.pie_chart_outline,
                title: 'Budgets',
                subtitle: 'Set limits and track category progress',
                screen: BudgetsScreen(api: api),
              ),
              _destination(
                context,
                icon: Icons.flag_outlined,
                title: 'Goals',
                subtitle: 'Build savings targets and contributions',
                screen: GoalsScreen(api: api),
              ),
              _destination(
                context,
                icon: Icons.show_chart,
                title: 'Cash-flow planning',
                subtitle: 'Forecast balances and simulate purchases',
                screen: PlanningScreen(api: api),
              ),
              _destination(
                context,
                icon: Icons.calendar_month_outlined,
                title: 'Financial calendar',
                subtitle: 'See bills, income, goal dates, and warnings',
                screen: FinancialCalendarScreen(api: api),
              ),
            ]),
            const SizedBox(height: 12),
            _section(context, 'Insights and alerts', [
              _destination(
                context,
                icon: Icons.insights_outlined,
                title: 'Analytics',
                subtitle: 'Explore trends, categories, and health',
                screen: AnalyticsScreen(api: api),
              ),
              _destination(
                context,
                icon: Icons.subscriptions_outlined,
                title: 'Subscriptions',
                subtitle: 'Review recurring costs and price changes',
                screen: SubscriptionsScreen(api: api),
              ),
              _destination(
                context,
                icon: Icons.notifications_outlined,
                title: 'Notifications',
                subtitle: 'Review alerts and notification preferences',
                screen: NotificationsScreen(api: api),
              ),
            ]),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: onSignOut,
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
            ),
          ],
        ),
      );

  Widget _section(
          BuildContext context, String title, List<Widget> destinations) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
            child: Text(title.toUpperCase(),
                style: Theme.of(context).textTheme.labelSmall),
          ),
          Card(child: Column(children: destinations)),
        ],
      );

  Widget _destination(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Widget screen,
  }) =>
      ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _open(context, screen),
      );
}
