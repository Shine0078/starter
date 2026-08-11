import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE'**
  String get appTitle;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navTransactions.
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get navTransactions;

  /// No description provided for @navAnalytics.
  ///
  /// In en, this message translates to:
  /// **'Analytics'**
  String get navAnalytics;

  /// No description provided for @navAccounts.
  ///
  /// In en, this message translates to:
  /// **'Accounts'**
  String get navAccounts;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get commonSignOut;

  /// No description provided for @commonSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get commonSearch;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @signInTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to FINVERSE'**
  String get signInTitle;

  /// No description provided for @signInAction.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInAction;

  /// No description provided for @registerAction.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get registerAction;

  /// No description provided for @emailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get emailLabel;

  /// No description provided for @passwordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get passwordLabel;

  /// No description provided for @offlineBannerTitle.
  ///
  /// In en, this message translates to:
  /// **'Offline - showing saved data'**
  String get offlineBannerTitle;

  /// No description provided for @offlineBannerPending.
  ///
  /// In en, this message translates to:
  /// **'Offline changes pending'**
  String get offlineBannerPending;

  /// No description provided for @offlineBannerPendingDetail.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 change saved on this device and will sync automatically when you are online.} other{{count} changes saved on this device and will sync automatically when you are online.}}'**
  String offlineBannerPendingDetail(num count);

  /// No description provided for @offlineBannerLastUpdated.
  ///
  /// In en, this message translates to:
  /// **'Last updated {date}. Changes are read-only until you reconnect.'**
  String offlineBannerLastUpdated(Object date);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @privacyTitle.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get privacyTitle;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @bankConnectionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Bank connections'**
  String get bankConnectionsTitle;

  /// No description provided for @budgetsTitle.
  ///
  /// In en, this message translates to:
  /// **'Budgets'**
  String get budgetsTitle;

  /// No description provided for @goalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Goals'**
  String get goalsTitle;

  /// No description provided for @planTitle.
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get planTitle;

  /// No description provided for @helpTitle.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get helpTitle;

  /// No description provided for @languageTitle.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageTitle;

  /// No description provided for @languageSystemDefault.
  ///
  /// In en, this message translates to:
  /// **'Use device language'**
  String get languageSystemDefault;

  /// No description provided for @languageEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get languageEnglish;

  /// No description provided for @languageFrench.
  ///
  /// In en, this message translates to:
  /// **'French'**
  String get languageFrench;

  /// No description provided for @languageBetaDetail.
  ///
  /// In en, this message translates to:
  /// **'Some screens are still being translated.'**
  String get languageBetaDetail;

  /// No description provided for @verificationEmailSent.
  ///
  /// In en, this message translates to:
  /// **'Verification email sent.'**
  String get verificationEmailSent;

  /// No description provided for @profileSettingsPrivacyTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings and privacy'**
  String get profileSettingsPrivacyTitle;

  /// No description provided for @profileSettingsPrivacyDetail.
  ///
  /// In en, this message translates to:
  /// **'Security, MFA, app lock, consent, export, and account controls'**
  String get profileSettingsPrivacyDetail;

  /// No description provided for @profilePlanningSection.
  ///
  /// In en, this message translates to:
  /// **'Planning'**
  String get profilePlanningSection;

  /// No description provided for @profileBudgetDetail.
  ///
  /// In en, this message translates to:
  /// **'Set limits and track category progress'**
  String get profileBudgetDetail;

  /// No description provided for @profileGoalsDetail.
  ///
  /// In en, this message translates to:
  /// **'Build savings targets and contributions'**
  String get profileGoalsDetail;

  /// No description provided for @profileCashFlowPlanningTitle.
  ///
  /// In en, this message translates to:
  /// **'Cash-flow planning'**
  String get profileCashFlowPlanningTitle;

  /// No description provided for @profileCashFlowPlanningDetail.
  ///
  /// In en, this message translates to:
  /// **'Forecast balances and simulate purchases'**
  String get profileCashFlowPlanningDetail;

  /// No description provided for @profileFinancialCalendarTitle.
  ///
  /// In en, this message translates to:
  /// **'Financial calendar'**
  String get profileFinancialCalendarTitle;

  /// No description provided for @profileFinancialCalendarDetail.
  ///
  /// In en, this message translates to:
  /// **'See bills, income, goal dates, and warnings'**
  String get profileFinancialCalendarDetail;

  /// No description provided for @profileInsightsSection.
  ///
  /// In en, this message translates to:
  /// **'Insights and alerts'**
  String get profileInsightsSection;

  /// No description provided for @profileAnalyticsDetail.
  ///
  /// In en, this message translates to:
  /// **'Explore trends, categories, and health'**
  String get profileAnalyticsDetail;

  /// No description provided for @profileSubscriptionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Subscriptions'**
  String get profileSubscriptionsTitle;

  /// No description provided for @profileSubscriptionsDetail.
  ///
  /// In en, this message translates to:
  /// **'Review recurring costs and price changes'**
  String get profileSubscriptionsDetail;

  /// No description provided for @profileNotificationsDetail.
  ///
  /// In en, this message translates to:
  /// **'Review alerts and notification preferences'**
  String get profileNotificationsDetail;

  /// No description provided for @profileCategorizationRulesTitle.
  ///
  /// In en, this message translates to:
  /// **'Categorization rules'**
  String get profileCategorizationRulesTitle;

  /// No description provided for @profileCategorizationRulesDetail.
  ///
  /// In en, this message translates to:
  /// **'Review or remove saved merchant rules'**
  String get profileCategorizationRulesDetail;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @assistantTitle.
  ///
  /// In en, this message translates to:
  /// **'Ask FINVERSE'**
  String get assistantTitle;

  /// No description provided for @assistantHeading.
  ///
  /// In en, this message translates to:
  /// **'A clear view of your money'**
  String get assistantHeading;

  /// No description provided for @assistantDescription.
  ///
  /// In en, this message translates to:
  /// **'Ask about spending, savings, merchants, or recurring charges. Answers use your selected-period aggregates and stay on FINVERSE.'**
  String get assistantDescription;

  /// No description provided for @assistantQuestionLabel.
  ///
  /// In en, this message translates to:
  /// **'Your question'**
  String get assistantQuestionLabel;

  /// No description provided for @assistantQuestionHint.
  ///
  /// In en, this message translates to:
  /// **'Where did I spend the most?'**
  String get assistantQuestionHint;

  /// No description provided for @assistantAskTooltip.
  ///
  /// In en, this message translates to:
  /// **'Ask'**
  String get assistantAskTooltip;

  /// No description provided for @assistantPromptHeading.
  ///
  /// In en, this message translates to:
  /// **'Try one of these'**
  String get assistantPromptHeading;

  /// No description provided for @assistantPromptSpending.
  ///
  /// In en, this message translates to:
  /// **'Where did I spend the most?'**
  String get assistantPromptSpending;

  /// No description provided for @assistantPromptSavings.
  ///
  /// In en, this message translates to:
  /// **'How much did I save?'**
  String get assistantPromptSavings;

  /// No description provided for @assistantPromptSubscriptions.
  ///
  /// In en, this message translates to:
  /// **'Which subscriptions am I paying for?'**
  String get assistantPromptSubscriptions;

  /// No description provided for @assistantPromptHigherSpending.
  ///
  /// In en, this message translates to:
  /// **'Is my spending higher than usual?'**
  String get assistantPromptHigherSpending;

  /// No description provided for @assistantQuestionRequired.
  ///
  /// In en, this message translates to:
  /// **'Ask a question about your spending or savings.'**
  String get assistantQuestionRequired;

  /// No description provided for @assistantCouldNotAnswer.
  ///
  /// In en, this message translates to:
  /// **'Could not answer that yet'**
  String get assistantCouldNotAnswer;

  /// No description provided for @assistantAnswerTitle.
  ///
  /// In en, this message translates to:
  /// **'Your answer'**
  String get assistantAnswerTitle;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsPreferencesTooltip.
  ///
  /// In en, this message translates to:
  /// **'Notification preferences'**
  String get notificationsPreferencesTooltip;

  /// No description provided for @notificationsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'You are all caught up'**
  String get notificationsEmptyTitle;

  /// No description provided for @notificationsEmptyDetail.
  ///
  /// In en, this message translates to:
  /// **'Budget, bill, subscription, unusual spending, balance, credit, and security alerts will appear here.'**
  String get notificationsEmptyDetail;

  /// No description provided for @notificationsMarkedRead.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 alert marked as read.} other{{count} alerts marked as read.}}'**
  String notificationsMarkedRead(num count);

  /// No description provided for @notificationPreferencesTitle.
  ///
  /// In en, this message translates to:
  /// **'Alert preferences'**
  String get notificationPreferencesTitle;

  /// No description provided for @notificationPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Notifications are disabled. Enable them in your device settings.'**
  String get notificationPermissionDenied;

  /// No description provided for @notificationBudgetProgress.
  ///
  /// In en, this message translates to:
  /// **'Budget progress'**
  String get notificationBudgetProgress;

  /// No description provided for @notificationBills.
  ///
  /// In en, this message translates to:
  /// **'Bills and due dates'**
  String get notificationBills;

  /// No description provided for @notificationCreditUtilization.
  ///
  /// In en, this message translates to:
  /// **'Credit utilization'**
  String get notificationCreditUtilization;

  /// No description provided for @notificationSubscriptionChanges.
  ///
  /// In en, this message translates to:
  /// **'Subscription changes'**
  String get notificationSubscriptionChanges;

  /// No description provided for @notificationLowBalance.
  ///
  /// In en, this message translates to:
  /// **'Low balance'**
  String get notificationLowBalance;

  /// No description provided for @notificationUnusualTransactions.
  ///
  /// In en, this message translates to:
  /// **'Unusual transactions'**
  String get notificationUnusualTransactions;

  /// No description provided for @notificationBankSync.
  ///
  /// In en, this message translates to:
  /// **'Bank synchronization'**
  String get notificationBankSync;

  /// No description provided for @notificationSecurityEvents.
  ///
  /// In en, this message translates to:
  /// **'Security events'**
  String get notificationSecurityEvents;

  /// No description provided for @notificationDeviceUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Device alerts unavailable here'**
  String get notificationDeviceUnavailable;

  /// No description provided for @notificationDeviceUnavailableDetail.
  ///
  /// In en, this message translates to:
  /// **'Native alerts are available in the Android and iPhone apps.'**
  String get notificationDeviceUnavailableDetail;

  /// No description provided for @notificationDeviceAlerts.
  ///
  /// In en, this message translates to:
  /// **'Device alerts'**
  String get notificationDeviceAlerts;

  /// No description provided for @notificationDeviceAlertsEnabled.
  ///
  /// In en, this message translates to:
  /// **'Unread FINVERSE alerts can appear in your notification tray.'**
  String get notificationDeviceAlertsEnabled;

  /// No description provided for @notificationDeviceAlertsDisabled.
  ///
  /// In en, this message translates to:
  /// **'Allow local alerts for unread budgets, bills, banks, and security events.'**
  String get notificationDeviceAlertsDisabled;

  /// No description provided for @notificationTurnOff.
  ///
  /// In en, this message translates to:
  /// **'Turn off'**
  String get notificationTurnOff;

  /// No description provided for @notificationEnable.
  ///
  /// In en, this message translates to:
  /// **'Enable'**
  String get notificationEnable;

  /// No description provided for @categorizationRulesDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this rule?'**
  String get categorizationRulesDeleteTitle;

  /// No description provided for @categorizationRulesDeleteDescription.
  ///
  /// In en, this message translates to:
  /// **'Future matching transactions will use the normal categorization pipeline again. Existing transaction choices stay unchanged.\n\n“{pattern}” → {category}'**
  String categorizationRulesDeleteDescription(String pattern, String category);

  /// No description provided for @categorizationRulesKeep.
  ///
  /// In en, this message translates to:
  /// **'Keep rule'**
  String get categorizationRulesKeep;

  /// No description provided for @categorizationRulesDeleted.
  ///
  /// In en, this message translates to:
  /// **'Rule deleted.'**
  String get categorizationRulesDeleted;

  /// No description provided for @categorizationRulesDeleteFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not delete this rule. {detail}'**
  String categorizationRulesDeleteFailed(String detail);

  /// No description provided for @categorizationRulesEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved rules yet'**
  String get categorizationRulesEmptyTitle;

  /// No description provided for @categorizationRulesEmptyDetail.
  ///
  /// In en, this message translates to:
  /// **'When you correct a transaction category, FINVERSE can remember that choice for matching merchants.'**
  String get categorizationRulesEmptyDetail;

  /// No description provided for @categorizationRulesIntro.
  ///
  /// In en, this message translates to:
  /// **'These rules apply to your account on every device. Deleting a rule does not rewrite the original bank record or existing edits.'**
  String get categorizationRulesIntro;

  /// No description provided for @categorizationRulesDeleteTooltip.
  ///
  /// In en, this message translates to:
  /// **'Delete rule'**
  String get categorizationRulesDeleteTooltip;

  /// No description provided for @subscriptionsRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh subscriptions'**
  String get subscriptionsRefreshTooltip;

  /// No description provided for @subscriptionsLoadError.
  ///
  /// In en, this message translates to:
  /// **'Could not load subscriptions'**
  String get subscriptionsLoadError;

  /// No description provided for @subscriptionsRecurringCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 recurring payment in {currency}} other{{count} recurring payments in {currency}}}'**
  String subscriptionsRecurringCount(num count, String currency);

  /// No description provided for @subscriptionsEstimatedMonthly.
  ///
  /// In en, this message translates to:
  /// **'Estimated monthly'**
  String get subscriptionsEstimatedMonthly;

  /// No description provided for @subscriptionsEstimatedYearly.
  ///
  /// In en, this message translates to:
  /// **'Estimated yearly'**
  String get subscriptionsEstimatedYearly;

  /// No description provided for @subscriptionsPriceChanges.
  ///
  /// In en, this message translates to:
  /// **'PRICE CHANGES'**
  String get subscriptionsPriceChanges;

  /// No description provided for @subscriptionsPriceIncrease.
  ///
  /// In en, this message translates to:
  /// **'{merchant} increased {percent}%'**
  String subscriptionsPriceIncrease(String merchant, num percent);

  /// No description provided for @subscriptionsAnnualImpact.
  ///
  /// In en, this message translates to:
  /// **'{from} to {to} · {impact} yearly impact'**
  String subscriptionsAnnualImpact(String from, String to, String impact);

  /// No description provided for @subscriptionsDetected.
  ///
  /// In en, this message translates to:
  /// **'DETECTED'**
  String get subscriptionsDetected;

  /// No description provided for @subscriptionsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No recurring subscriptions detected.'**
  String get subscriptionsEmptyTitle;

  /// No description provided for @subscriptionsEmptyDetail.
  ///
  /// In en, this message translates to:
  /// **'Connect and sync a bank with at least a few months of transactions.'**
  String get subscriptionsEmptyDetail;

  /// No description provided for @subscriptionsNextExpected.
  ///
  /// In en, this message translates to:
  /// **'Next expected {date}'**
  String subscriptionsNextExpected(String date);

  /// No description provided for @subscriptionsPerYear.
  ///
  /// In en, this message translates to:
  /// **'/year'**
  String get subscriptionsPerYear;

  /// No description provided for @subscriptionsMayHaveEnded.
  ///
  /// In en, this message translates to:
  /// **'MAY HAVE ENDED'**
  String get subscriptionsMayHaveEnded;

  /// No description provided for @subscriptionsDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Subscriptions are detected from transaction patterns. Confirm charges with the merchant before taking action.'**
  String get subscriptionsDisclaimer;

  /// No description provided for @subscriptionsCadenceWeekly.
  ///
  /// In en, this message translates to:
  /// **'Weekly'**
  String get subscriptionsCadenceWeekly;

  /// No description provided for @subscriptionsCadenceBiweekly.
  ///
  /// In en, this message translates to:
  /// **'Every two weeks'**
  String get subscriptionsCadenceBiweekly;

  /// No description provided for @subscriptionsCadenceMonthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get subscriptionsCadenceMonthly;

  /// No description provided for @subscriptionsCadenceQuarterly.
  ///
  /// In en, this message translates to:
  /// **'Quarterly'**
  String get subscriptionsCadenceQuarterly;

  /// No description provided for @subscriptionsCadenceAnnual.
  ///
  /// In en, this message translates to:
  /// **'Yearly'**
  String get subscriptionsCadenceAnnual;

  /// No description provided for @calendarRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh calendar'**
  String get calendarRefreshTooltip;

  /// No description provided for @calendarDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'This view uses repeatable income and recurring bills only. Actual balances can differ when everyday spending or a bank sync is missing.'**
  String get calendarDisclaimer;

  /// No description provided for @calendarNextNinetyDays.
  ///
  /// In en, this message translates to:
  /// **'Next 90 days'**
  String get calendarNextNinetyDays;

  /// No description provided for @calendarExpectedEventCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No expected events} =1{1 expected event} other{{count} expected events}}'**
  String calendarExpectedEventCount(num count);

  /// No description provided for @calendarLowBalanceDateCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{no low-balance dates} =1{1 low-balance date} other{{count} low-balance dates}}'**
  String calendarLowBalanceDateCount(num count);

  /// No description provided for @calendarStartingBalance.
  ///
  /// In en, this message translates to:
  /// **'Starting balance'**
  String get calendarStartingBalance;

  /// No description provided for @calendarProjectedEnding.
  ///
  /// In en, this message translates to:
  /// **'Projected ending'**
  String get calendarProjectedEnding;

  /// No description provided for @calendarPreviousMonth.
  ///
  /// In en, this message translates to:
  /// **'Previous month'**
  String get calendarPreviousMonth;

  /// No description provided for @calendarNextMonth.
  ///
  /// In en, this message translates to:
  /// **'Next month'**
  String get calendarNextMonth;

  /// No description provided for @calendarOutsideForecast.
  ///
  /// In en, this message translates to:
  /// **'{date} outside forecast'**
  String calendarOutsideForecast(String date);

  /// No description provided for @calendarGoalTarget.
  ///
  /// In en, this message translates to:
  /// **'Savings goal target, {name}'**
  String calendarGoalTarget(String name);

  /// No description provided for @calendarNoExpectedEvents.
  ///
  /// In en, this message translates to:
  /// **'No expected events'**
  String get calendarNoExpectedEvents;

  /// No description provided for @calendarProjectedLowBalance.
  ///
  /// In en, this message translates to:
  /// **'Projected low balance'**
  String get calendarProjectedLowBalance;

  /// No description provided for @calendarProjectedLowBalanceSemantics.
  ///
  /// In en, this message translates to:
  /// **'projected low balance'**
  String get calendarProjectedLowBalanceSemantics;

  /// No description provided for @calendarLowBalanceDetail.
  ///
  /// In en, this message translates to:
  /// **'Review bills or plan a buffer before this date.'**
  String get calendarLowBalanceDetail;

  /// No description provided for @calendarSelectDate.
  ///
  /// In en, this message translates to:
  /// **'Select a forecast date'**
  String get calendarSelectDate;

  /// No description provided for @calendarSelectDateDetail.
  ///
  /// In en, this message translates to:
  /// **'Tap a highlighted day to see expected events.'**
  String get calendarSelectDateDetail;

  /// No description provided for @calendarExpectedIncome.
  ///
  /// In en, this message translates to:
  /// **'Expected income'**
  String get calendarExpectedIncome;

  /// No description provided for @calendarExpectedBill.
  ///
  /// In en, this message translates to:
  /// **'Expected bill'**
  String get calendarExpectedBill;

  /// No description provided for @calendarPatternConfidence.
  ///
  /// In en, this message translates to:
  /// **'{percent}% pattern confidence'**
  String calendarPatternConfidence(num percent);

  /// No description provided for @calendarGoalProgress.
  ///
  /// In en, this message translates to:
  /// **'Savings goal target · {remaining} remaining'**
  String calendarGoalProgress(String remaining);

  /// No description provided for @calendarSuggestedMonthly.
  ///
  /// In en, this message translates to:
  /// **'{amount} suggested monthly'**
  String calendarSuggestedMonthly(String amount);

  /// No description provided for @calendarUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Calendar is unavailable'**
  String get calendarUnavailable;

  /// No description provided for @calendarUnavailableDetail.
  ///
  /// In en, this message translates to:
  /// **'Check your connection and try again.'**
  String get calendarUnavailableDetail;

  /// No description provided for @errorConnection.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t reach the server. Check your connection.'**
  String get errorConnection;

  /// No description provided for @errorServerUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The server is temporarily unavailable. Try again shortly.'**
  String get errorServerUnavailable;

  /// No description provided for @errorSessionInvalid.
  ///
  /// In en, this message translates to:
  /// **'Your session is no longer valid. Sign in again.'**
  String get errorSessionInvalid;

  /// No description provided for @errorServerSide.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong on our side. Try again shortly.'**
  String get errorServerSide;

  /// No description provided for @errorTimeout.
  ///
  /// In en, this message translates to:
  /// **'The server did not respond. Check your connection and try again.'**
  String get errorTimeout;

  /// No description provided for @categoryExplanationLearned.
  ///
  /// In en, this message translates to:
  /// **'Learned from a similar merchant you categorized before • {percent}% confidence.'**
  String categoryExplanationLearned(num percent);

  /// No description provided for @receiptScanPhoto.
  ///
  /// In en, this message translates to:
  /// **'Scan a receipt photo'**
  String get receiptScanPhoto;

  /// No description provided for @receiptScanPhotoDetail.
  ///
  /// In en, this message translates to:
  /// **'Recognized on this phone — the image is never uploaded'**
  String get receiptScanPhotoDetail;

  /// No description provided for @receiptPasteText.
  ///
  /// In en, this message translates to:
  /// **'Paste receipt text'**
  String get receiptPasteText;

  /// No description provided for @receiptPasteTextDetail.
  ///
  /// In en, this message translates to:
  /// **'Use text copied from a receipt or your phone’s OCR'**
  String get receiptPasteTextDetail;

  /// No description provided for @receiptTakePhoto.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get receiptTakePhoto;

  /// No description provided for @receiptChoosePhoto.
  ///
  /// In en, this message translates to:
  /// **'Choose from your photos'**
  String get receiptChoosePhoto;

  /// No description provided for @receiptReviewScanned.
  ///
  /// In en, this message translates to:
  /// **'Review scanned receipt text'**
  String get receiptReviewScanned;

  /// No description provided for @receiptPasteExplanation.
  ///
  /// In en, this message translates to:
  /// **'Paste receipt text. FINVERSE extracts the merchant, date, total, and tax. Images are never uploaded.'**
  String get receiptPasteExplanation;

  /// No description provided for @receiptReviewExplanation.
  ///
  /// In en, this message translates to:
  /// **'Check the recognized text before attaching it. Only this text is sent to FINVERSE — never the photo.'**
  String get receiptReviewExplanation;

  /// No description provided for @receiptAttachAction.
  ///
  /// In en, this message translates to:
  /// **'Attach'**
  String get receiptAttachAction;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
