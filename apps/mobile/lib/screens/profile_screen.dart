import 'package:flutter/material.dart';

import '../api/app_lock.dart';
import '../api/client.dart';
import '../l10n/app_localizations.dart';
import 'analytics_screen.dart';
import 'categorization_rules_screen.dart';
import 'financial_calendar_screen.dart';
import 'goals_screen.dart';
import 'budgets_screen.dart';
import 'notifications_screen.dart';
import 'planning_screen.dart';
import 'settings_screen.dart';
import 'split_screen.dart';
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
          SnackBar(
              content:
                  Text(AppLocalizations.of(context).verificationEmailSent)),
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
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(l10n.profileSettingsPrivacyTitle),
              subtitle: Text(l10n.profileSettingsPrivacyDetail),
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
          _section(context, l10n.profilePlanningSection, [
            _destination(
              context,
              icon: Icons.pie_chart_outline,
              title: l10n.budgetsTitle,
              subtitle: l10n.profileBudgetDetail,
              screen: BudgetsScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.flag_outlined,
              title: l10n.goalsTitle,
              subtitle: l10n.profileGoalsDetail,
              screen: GoalsScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.group_outlined,
              title: l10n.splitTitle,
              subtitle: l10n.profileSplitDetail,
              screen: SplitScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.show_chart,
              title: l10n.profileCashFlowPlanningTitle,
              subtitle: l10n.profileCashFlowPlanningDetail,
              screen: PlanningScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.calendar_month_outlined,
              title: l10n.profileFinancialCalendarTitle,
              subtitle: l10n.profileFinancialCalendarDetail,
              screen: FinancialCalendarScreen(api: api),
            ),
          ]),
          const SizedBox(height: 12),
          _section(context, l10n.profileInsightsSection, [
            _destination(
              context,
              icon: Icons.insights_outlined,
              title: l10n.navAnalytics,
              subtitle: l10n.profileAnalyticsDetail,
              screen: AnalyticsScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.subscriptions_outlined,
              title: l10n.profileSubscriptionsTitle,
              subtitle: l10n.profileSubscriptionsDetail,
              screen: SubscriptionsScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.notifications_outlined,
              title: l10n.notificationsTitle,
              subtitle: l10n.profileNotificationsDetail,
              screen: NotificationsScreen(api: api),
            ),
            _destination(
              context,
              icon: Icons.auto_fix_high_outlined,
              title: l10n.profileCategorizationRulesTitle,
              subtitle: l10n.profileCategorizationRulesDetail,
              screen: CategorizationRulesScreen(api: api),
            ),
          ]),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: onSignOut,
            icon: const Icon(Icons.logout),
            label: Text(l10n.commonSignOut),
          ),
        ],
      ),
    );
  }

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
