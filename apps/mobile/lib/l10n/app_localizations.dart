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
  /// **'Your plan'**
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

  /// No description provided for @commonCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get commonCreate;

  /// No description provided for @commonAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get commonAdd;

  /// No description provided for @commonRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get commonRemove;

  /// No description provided for @commonVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get commonVerify;

  /// No description provided for @budgetCreateTitle.
  ///
  /// In en, this message translates to:
  /// **'Create monthly budget'**
  String get budgetCreateTitle;

  /// No description provided for @budgetCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get budgetCategory;

  /// No description provided for @budgetMonthlyLimit.
  ///
  /// In en, this message translates to:
  /// **'Monthly limit (dollars)'**
  String get budgetMonthlyLimit;

  /// No description provided for @budgetPositiveAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a positive dollar amount.'**
  String get budgetPositiveAmount;

  /// No description provided for @budgetSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not save budget. {detail}'**
  String budgetSaveFailed(String detail);

  /// No description provided for @budgetNew.
  ///
  /// In en, this message translates to:
  /// **'New budget'**
  String get budgetNew;

  /// No description provided for @budgetEmpty.
  ///
  /// In en, this message translates to:
  /// **'Create a budget to start tracking progress.'**
  String get budgetEmpty;

  /// No description provided for @budgetRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove this budget?'**
  String get budgetRemoveTitle;

  /// No description provided for @budgetStopTracking.
  ///
  /// In en, this message translates to:
  /// **'Stop tracking {category}?'**
  String budgetStopTracking(String category);

  /// No description provided for @budgetRemoveFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not remove budget. {detail}'**
  String budgetRemoveFailed(String detail);

  /// No description provided for @goalCreateTitle.
  ///
  /// In en, this message translates to:
  /// **'Create savings goal'**
  String get goalCreateTitle;

  /// No description provided for @goalName.
  ///
  /// In en, this message translates to:
  /// **'Goal name'**
  String get goalName;

  /// No description provided for @goalTargetAmount.
  ///
  /// In en, this message translates to:
  /// **'Target amount'**
  String get goalTargetAmount;

  /// No description provided for @goalAlreadySaved.
  ///
  /// In en, this message translates to:
  /// **'Already saved'**
  String get goalAlreadySaved;

  /// No description provided for @goalTargetDate.
  ///
  /// In en, this message translates to:
  /// **'Target date (YYYY-MM-DD, optional)'**
  String get goalTargetDate;

  /// No description provided for @goalEnterValid.
  ///
  /// In en, this message translates to:
  /// **'Enter a name and valid positive target.'**
  String get goalEnterValid;

  /// No description provided for @goalCreateFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not create goal. {detail}'**
  String goalCreateFailed(String detail);

  /// No description provided for @goalAddTo.
  ///
  /// In en, this message translates to:
  /// **'Add to {name}'**
  String goalAddTo(String name);

  /// No description provided for @goalContributionAmount.
  ///
  /// In en, this message translates to:
  /// **'Contribution amount'**
  String get goalContributionAmount;

  /// No description provided for @goalNew.
  ///
  /// In en, this message translates to:
  /// **'New goal'**
  String get goalNew;

  /// No description provided for @goalEmpty.
  ///
  /// In en, this message translates to:
  /// **'Create a goal and turn saving into a plan.'**
  String get goalEmpty;

  /// No description provided for @goalSavedOf.
  ///
  /// In en, this message translates to:
  /// **'{saved} saved of {target}'**
  String goalSavedOf(String saved, String target);

  /// No description provided for @goalRemaining.
  ///
  /// In en, this message translates to:
  /// **'{amount} remaining'**
  String goalRemaining(String amount);

  /// No description provided for @goalMonthlyTarget.
  ///
  /// In en, this message translates to:
  /// **'{amount}/month reaches the target date.'**
  String goalMonthlyTarget(String amount);

  /// No description provided for @goalCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get goalCompleted;

  /// No description provided for @goalAddSavings.
  ///
  /// In en, this message translates to:
  /// **'Add savings'**
  String get goalAddSavings;

  /// No description provided for @planningPositiveAmount.
  ///
  /// In en, this message translates to:
  /// **'Enter a positive amount with at most two decimals.'**
  String get planningPositiveAmount;

  /// No description provided for @planningOpenCalendar.
  ///
  /// In en, this message translates to:
  /// **'Open financial calendar'**
  String get planningOpenCalendar;

  /// No description provided for @planningConservativeForecast.
  ///
  /// In en, this message translates to:
  /// **'Conservative forecast'**
  String get planningConservativeForecast;

  /// No description provided for @planningForecastDetail.
  ///
  /// In en, this message translates to:
  /// **'Repeatable income and bills only. Everyday spending is not predicted.'**
  String get planningForecastDetail;

  /// No description provided for @planningToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get planningToday;

  /// No description provided for @planningEnd.
  ///
  /// In en, this message translates to:
  /// **'End'**
  String get planningEnd;

  /// No description provided for @planningForecastSemantics.
  ///
  /// In en, this message translates to:
  /// **'Cash flow forecast from {start} to {end}. {detail}'**
  String planningForecastSemantics(String start, String end, String detail);

  /// No description provided for @planningNoNegativeBalance.
  ///
  /// In en, this message translates to:
  /// **'No modeled negative balance dates.'**
  String get planningNoNegativeBalance;

  /// No description provided for @planningNegativeBalanceCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 modeled negative balance date.} other{{count} modeled negative balance dates.}}'**
  String planningNegativeBalanceCount(num count);

  /// No description provided for @planningProjectedLowBalanceCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 projected low-balance day} other{{count} projected low-balance days}}'**
  String planningProjectedLowBalanceCount(num count);

  /// No description provided for @planningAffordPurchase.
  ///
  /// In en, this message translates to:
  /// **'Can I afford a purchase?'**
  String get planningAffordPurchase;

  /// No description provided for @planningPurchaseAmount.
  ///
  /// In en, this message translates to:
  /// **'Purchase amount ({currency})'**
  String planningPurchaseAmount(String currency);

  /// No description provided for @planningPurchaseDate.
  ///
  /// In en, this message translates to:
  /// **'Purchase date'**
  String get planningPurchaseDate;

  /// No description provided for @planningChecking.
  ///
  /// In en, this message translates to:
  /// **'Checking…'**
  String get planningChecking;

  /// No description provided for @planningCheckScenario.
  ///
  /// In en, this message translates to:
  /// **'Check scenario'**
  String get planningCheckScenario;

  /// No description provided for @planningAfterPurchase.
  ///
  /// In en, this message translates to:
  /// **'After purchase'**
  String get planningAfterPurchase;

  /// No description provided for @planningEndForecast.
  ///
  /// In en, this message translates to:
  /// **'End of forecast'**
  String get planningEndForecast;

  /// No description provided for @planningExpectedEvents.
  ///
  /// In en, this message translates to:
  /// **'Expected recurring events'**
  String get planningExpectedEvents;

  /// No description provided for @planningNoPattern.
  ///
  /// In en, this message translates to:
  /// **'No strong recurring pattern was found.'**
  String get planningNoPattern;

  /// No description provided for @analyticsRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh analytics'**
  String get analyticsRefreshTooltip;

  /// No description provided for @analyticsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Analytics are unavailable'**
  String get analyticsUnavailable;

  /// No description provided for @analyticsUnavailableDetail.
  ///
  /// In en, this message translates to:
  /// **'Check your connection and try again. Nothing has been lost.'**
  String get analyticsUnavailableDetail;

  /// No description provided for @analyticsPeriodLabel.
  ///
  /// In en, this message translates to:
  /// **'Analytics period'**
  String get analyticsPeriodLabel;

  /// No description provided for @analyticsThisWeek.
  ///
  /// In en, this message translates to:
  /// **'This week'**
  String get analyticsThisWeek;

  /// No description provided for @analyticsThisMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get analyticsThisMonth;

  /// No description provided for @analyticsLastThreeMonths.
  ///
  /// In en, this message translates to:
  /// **'Last 3 months'**
  String get analyticsLastThreeMonths;

  /// No description provided for @analyticsLastSixMonths.
  ///
  /// In en, this message translates to:
  /// **'Last 6 months'**
  String get analyticsLastSixMonths;

  /// No description provided for @analyticsLastYear.
  ///
  /// In en, this message translates to:
  /// **'Last year'**
  String get analyticsLastYear;

  /// No description provided for @analyticsAllHistory.
  ///
  /// In en, this message translates to:
  /// **'All history'**
  String get analyticsAllHistory;

  /// No description provided for @analyticsCustomRange.
  ///
  /// In en, this message translates to:
  /// **'Custom range'**
  String get analyticsCustomRange;

  /// No description provided for @analyticsChooseFirstDay.
  ///
  /// In en, this message translates to:
  /// **'Choose the first day'**
  String get analyticsChooseFirstDay;

  /// No description provided for @analyticsChooseLastDay.
  ///
  /// In en, this message translates to:
  /// **'Choose the last day'**
  String get analyticsChooseLastDay;

  /// No description provided for @analyticsHistoryEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Not enough transaction history yet'**
  String get analyticsHistoryEmptyTitle;

  /// No description provided for @analyticsHistoryEmptyDetail.
  ///
  /// In en, this message translates to:
  /// **'Connect a bank or add transactions to see trends.'**
  String get analyticsHistoryEmptyDetail;

  /// No description provided for @analyticsExplainableInsights.
  ///
  /// In en, this message translates to:
  /// **'Explainable insights'**
  String get analyticsExplainableInsights;

  /// No description provided for @analyticsEvidenceCount.
  ///
  /// In en, this message translates to:
  /// **'Based on {count, plural, =1{1 transaction} other{{count} transactions}}'**
  String analyticsEvidenceCount(num count);

  /// No description provided for @analyticsTimeline.
  ///
  /// In en, this message translates to:
  /// **'Financial timeline'**
  String get analyticsTimeline;

  /// No description provided for @analyticsPlanAction.
  ///
  /// In en, this message translates to:
  /// **'Plan a purchase or view your forecast'**
  String get analyticsPlanAction;

  /// No description provided for @analyticsIncome.
  ///
  /// In en, this message translates to:
  /// **'Income'**
  String get analyticsIncome;

  /// No description provided for @analyticsNetExpenses.
  ///
  /// In en, this message translates to:
  /// **'Net expenses'**
  String get analyticsNetExpenses;

  /// No description provided for @analyticsSavings.
  ///
  /// In en, this message translates to:
  /// **'Savings'**
  String get analyticsSavings;

  /// No description provided for @analyticsSavingsRate.
  ///
  /// In en, this message translates to:
  /// **'Savings rate'**
  String get analyticsSavingsRate;

  /// No description provided for @analyticsPaceNoHistory.
  ///
  /// In en, this message translates to:
  /// **'Keep using FINVERSE to build a useful historical baseline.'**
  String get analyticsPaceNoHistory;

  /// No description provided for @analyticsPaceNoComparison.
  ///
  /// In en, this message translates to:
  /// **'There is not enough comparable history for a pace comparison.'**
  String get analyticsPaceNoComparison;

  /// No description provided for @analyticsPaceProjected.
  ///
  /// In en, this message translates to:
  /// **'Projected spending is {percent}% {direction} your historical pace.'**
  String analyticsPaceProjected(String percent, String direction);

  /// No description provided for @analyticsPaceAbove.
  ///
  /// In en, this message translates to:
  /// **'above'**
  String get analyticsPaceAbove;

  /// No description provided for @analyticsPaceBelow.
  ///
  /// In en, this message translates to:
  /// **'below'**
  String get analyticsPaceBelow;

  /// No description provided for @analyticsPaceTitle.
  ///
  /// In en, this message translates to:
  /// **'Spending pace: {amount}'**
  String analyticsPaceTitle(String amount);

  /// No description provided for @analyticsPaceCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current: {amount}'**
  String analyticsPaceCurrent(String amount);

  /// No description provided for @analyticsRefundsMatched.
  ///
  /// In en, this message translates to:
  /// **'Refunds matched'**
  String get analyticsRefundsMatched;

  /// No description provided for @analyticsRefundsDetail.
  ///
  /// In en, this message translates to:
  /// **'These refunds were linked to earlier purchases using merchant and amount evidence.'**
  String get analyticsRefundsDetail;

  /// No description provided for @analyticsRefundRow.
  ///
  /// In en, this message translates to:
  /// **'{amount} refunded · {days} days after purchase'**
  String analyticsRefundRow(String amount, num days);

  /// No description provided for @analyticsRecurringCharges.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 recurring charge} other{{count} recurring charges}}'**
  String analyticsRecurringCharges(num count);

  /// No description provided for @analyticsSubscriptionTotals.
  ///
  /// In en, this message translates to:
  /// **'{monthly}/month · {yearly}/year'**
  String analyticsSubscriptionTotals(String monthly, String yearly);

  /// No description provided for @analyticsPriceRiseCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 price rise} other{{count} price rises}}'**
  String analyticsPriceRiseCount(num count);

  /// No description provided for @analyticsPriorityCritical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get analyticsPriorityCritical;

  /// No description provided for @analyticsPriorityImportant.
  ///
  /// In en, this message translates to:
  /// **'Important'**
  String get analyticsPriorityImportant;

  /// No description provided for @analyticsPriorityInfo.
  ///
  /// In en, this message translates to:
  /// **'Info'**
  String get analyticsPriorityInfo;

  /// No description provided for @onboardingSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get onboardingSkip;

  /// No description provided for @onboardingMoneyTitle.
  ///
  /// In en, this message translates to:
  /// **'See your money clearly'**
  String get onboardingMoneyTitle;

  /// No description provided for @onboardingMoneyDetail.
  ///
  /// In en, this message translates to:
  /// **'Bring accounts and transactions into one private view, then understand where every dollar is going.'**
  String get onboardingMoneyDetail;

  /// No description provided for @onboardingProgressTitle.
  ///
  /// In en, this message translates to:
  /// **'Turn plans into progress'**
  String get onboardingProgressTitle;

  /// No description provided for @onboardingProgressDetail.
  ///
  /// In en, this message translates to:
  /// **'Set budgets and savings goals, monitor subscriptions, and get useful alerts before small problems grow.'**
  String get onboardingProgressDetail;

  /// No description provided for @onboardingPrivacyTitle.
  ///
  /// In en, this message translates to:
  /// **'Connect without sharing credentials'**
  String get onboardingPrivacyTitle;

  /// No description provided for @onboardingPrivacyDetail.
  ///
  /// In en, this message translates to:
  /// **'Plaid handles bank sign-in. FINVERSE never receives your bank password and encrypts provider access tokens.'**
  String get onboardingPrivacyDetail;

  /// No description provided for @onboardingGetStarted.
  ///
  /// In en, this message translates to:
  /// **'Get started'**
  String get onboardingGetStarted;

  /// No description provided for @onboardingContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get onboardingContinue;

  /// No description provided for @loginCreateAccountHeading.
  ///
  /// In en, this message translates to:
  /// **'Create your account'**
  String get loginCreateAccountHeading;

  /// No description provided for @loginCreateAccountPrompt.
  ///
  /// In en, this message translates to:
  /// **'Create an account'**
  String get loginCreateAccountPrompt;

  /// No description provided for @loginRestoreAccountHeading.
  ///
  /// In en, this message translates to:
  /// **'Restore your account'**
  String get loginRestoreAccountHeading;

  /// No description provided for @loginWelcomeBack.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get loginWelcomeBack;

  /// No description provided for @loginEmailRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your email address.'**
  String get loginEmailRequired;

  /// No description provided for @loginEmailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address.'**
  String get loginEmailInvalid;

  /// No description provided for @loginPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your password.'**
  String get loginPasswordRequired;

  /// No description provided for @loginPasswordMinimum.
  ///
  /// In en, this message translates to:
  /// **'Use at least 12 characters.'**
  String get loginPasswordMinimum;

  /// No description provided for @loginPasswordHelper.
  ///
  /// In en, this message translates to:
  /// **'At least 12 characters'**
  String get loginPasswordHelper;

  /// No description provided for @loginShowPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get loginShowPassword;

  /// No description provided for @loginHidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get loginHidePassword;

  /// No description provided for @loginLegalLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading current legal documents…'**
  String get loginLegalLoading;

  /// No description provided for @loginAcceptTerms.
  ///
  /// In en, this message translates to:
  /// **'I accept the Terms of Service'**
  String get loginAcceptTerms;

  /// No description provided for @loginReadTerms.
  ///
  /// In en, this message translates to:
  /// **'Read Terms ({version})'**
  String loginReadTerms(String version);

  /// No description provided for @loginAcknowledgePrivacy.
  ///
  /// In en, this message translates to:
  /// **'I acknowledge the Privacy Notice'**
  String get loginAcknowledgePrivacy;

  /// No description provided for @loginReadPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Read Privacy Notice ({version})'**
  String loginReadPrivacy(String version);

  /// No description provided for @loginRestoreAction.
  ///
  /// In en, this message translates to:
  /// **'Restore account'**
  String get loginRestoreAction;

  /// No description provided for @loginForgotPassword.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get loginForgotPassword;

  /// No description provided for @loginAlreadyHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'I already have an account'**
  String get loginAlreadyHaveAccount;

  /// No description provided for @loginBackToSignIn.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get loginBackToSignIn;

  /// No description provided for @loginCancelDeletion.
  ///
  /// In en, this message translates to:
  /// **'Cancel scheduled account deletion'**
  String get loginCancelDeletion;

  /// No description provided for @loginLegalLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Legal documents could not be loaded. Check your connection and try again.'**
  String get loginLegalLoadFailed;

  /// No description provided for @loginLegalUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Legal documents could not be loaded. Try again.'**
  String get loginLegalUnavailable;

  /// No description provided for @loginAcceptLegal.
  ///
  /// In en, this message translates to:
  /// **'Accept the Terms of Service and Privacy Notice to continue.'**
  String get loginAcceptLegal;

  /// No description provided for @loginOpenLegalFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open the legal document.'**
  String get loginOpenLegalFailed;

  /// No description provided for @loginSessionPersistenceFailed.
  ///
  /// In en, this message translates to:
  /// **'Your credentials were accepted, but this device could not save the secure session. Unlock your phone and try again.'**
  String get loginSessionPersistenceFailed;

  /// No description provided for @loginMfaTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify it\'s you'**
  String get loginMfaTitle;

  /// No description provided for @loginMfaDetail.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code from your authenticator app, or one of your recovery codes.'**
  String get loginMfaDetail;

  /// No description provided for @loginMfaCode.
  ///
  /// In en, this message translates to:
  /// **'Authenticator or recovery code'**
  String get loginMfaCode;

  /// No description provided for @loginMfaFailed.
  ///
  /// In en, this message translates to:
  /// **'Verification failed. Try signing in again.'**
  String get loginMfaFailed;

  /// No description provided for @loginResetTitle.
  ///
  /// In en, this message translates to:
  /// **'Reset password'**
  String get loginResetTitle;

  /// No description provided for @loginResetSend.
  ///
  /// In en, this message translates to:
  /// **'Send reset code'**
  String get loginResetSend;

  /// No description provided for @loginResetCodeTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your reset code'**
  String get loginResetCodeTitle;

  /// No description provided for @loginResetSent.
  ///
  /// In en, this message translates to:
  /// **'If an account exists, a one-hour reset code has been sent.'**
  String get loginResetSent;

  /// No description provided for @loginResetCode.
  ///
  /// In en, this message translates to:
  /// **'Reset code'**
  String get loginResetCode;

  /// No description provided for @loginNewPassword.
  ///
  /// In en, this message translates to:
  /// **'New password (12+ characters)'**
  String get loginNewPassword;

  /// No description provided for @loginLater.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get loginLater;

  /// No description provided for @loginSetNewPassword.
  ///
  /// In en, this message translates to:
  /// **'Set new password'**
  String get loginSetNewPassword;

  /// No description provided for @loginPasswordUpdated.
  ///
  /// In en, this message translates to:
  /// **'Password updated. You can sign in now.'**
  String get loginPasswordUpdated;

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

  /// No description provided for @bankPlanConnectionLimit.
  ///
  /// In en, this message translates to:
  /// **'Your {planName} plan connects up to {limit} {institutions}. Upgrade to connect more.'**
  String bankPlanConnectionLimit(
      String planName, num limit, String institutions);

  /// No description provided for @bankInstitution.
  ///
  /// In en, this message translates to:
  /// **'institution'**
  String get bankInstitution;

  /// No description provided for @bankInstitutions.
  ///
  /// In en, this message translates to:
  /// **'institutions'**
  String get bankInstitutions;

  /// No description provided for @bankConnectAction.
  ///
  /// In en, this message translates to:
  /// **'Connect bank'**
  String get bankConnectAction;

  /// No description provided for @bankReconnectThisAction.
  ///
  /// In en, this message translates to:
  /// **'reconnect this bank'**
  String get bankReconnectThisAction;

  /// No description provided for @bankConnectionNotCompleted.
  ///
  /// In en, this message translates to:
  /// **'Bank connection was not completed.'**
  String get bankConnectionNotCompleted;

  /// No description provided for @bankStepUpTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm it’s you'**
  String get bankStepUpTitle;

  /// No description provided for @bankStepUpDetail.
  ///
  /// In en, this message translates to:
  /// **'Enter your FINVERSE password to {action}. Plaid handles your bank sign-in separately.'**
  String bankStepUpDetail(String action);

  /// No description provided for @bankPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE password'**
  String get bankPasswordLabel;

  /// No description provided for @bankContinueAction.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get bankContinueAction;

  /// No description provided for @bankTransactionsCurrent.
  ///
  /// In en, this message translates to:
  /// **'Transactions are up to date.'**
  String get bankTransactionsCurrent;

  /// No description provided for @bankDisconnectTitle.
  ///
  /// In en, this message translates to:
  /// **'Disconnect {institution}?'**
  String bankDisconnectTitle(String institution);

  /// No description provided for @bankDisconnectDetail.
  ///
  /// In en, this message translates to:
  /// **'Plaid access will be revoked immediately. Transactions already imported into FINVERSE are kept so your budgets and history remain useful.'**
  String get bankDisconnectDetail;

  /// No description provided for @bankDisconnectAction.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get bankDisconnectAction;

  /// No description provided for @bankAccessRevoked.
  ///
  /// In en, this message translates to:
  /// **'Bank access revoked.'**
  String get bankAccessRevoked;

  /// No description provided for @bankAddManualTitle.
  ///
  /// In en, this message translates to:
  /// **'Add manual account'**
  String get bankAddManualTitle;

  /// No description provided for @bankEditManualTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit manual account'**
  String get bankEditManualTitle;

  /// No description provided for @bankAccountNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Account name'**
  String get bankAccountNameLabel;

  /// No description provided for @bankAccountTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Account type'**
  String get bankAccountTypeLabel;

  /// No description provided for @bankManualCash.
  ///
  /// In en, this message translates to:
  /// **'Cash or wallet'**
  String get bankManualCash;

  /// No description provided for @bankManualChecking.
  ///
  /// In en, this message translates to:
  /// **'Offline chequing'**
  String get bankManualChecking;

  /// No description provided for @bankManualSavings.
  ///
  /// In en, this message translates to:
  /// **'Offline savings'**
  String get bankManualSavings;

  /// No description provided for @bankManualInvestment.
  ///
  /// In en, this message translates to:
  /// **'Investment value'**
  String get bankManualInvestment;

  /// No description provided for @bankManualLoan.
  ///
  /// In en, this message translates to:
  /// **'Loan or other debt'**
  String get bankManualLoan;

  /// No description provided for @bankAmountOwedLabel.
  ///
  /// In en, this message translates to:
  /// **'Amount owed'**
  String get bankAmountOwedLabel;

  /// No description provided for @bankCurrentValueLabel.
  ///
  /// In en, this message translates to:
  /// **'Current value'**
  String get bankCurrentValueLabel;

  /// No description provided for @bankAmountHelper.
  ///
  /// In en, this message translates to:
  /// **'Enter a positive amount; debts are stored as owed.'**
  String get bankAmountHelper;

  /// No description provided for @bankCurrencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Currency (for example CAD)'**
  String get bankCurrencyLabel;

  /// No description provided for @bankAddAccountAction.
  ///
  /// In en, this message translates to:
  /// **'Add account'**
  String get bankAddAccountAction;

  /// No description provided for @bankSaveChangesAction.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get bankSaveChangesAction;

  /// No description provided for @bankManualAccountInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a name, a three-letter currency, and a valid amount.'**
  String get bankManualAccountInvalid;

  /// No description provided for @bankManualAccountAdded.
  ///
  /// In en, this message translates to:
  /// **'Manual account added.'**
  String get bankManualAccountAdded;

  /// No description provided for @bankManualAccountUpdated.
  ///
  /// In en, this message translates to:
  /// **'Manual account updated.'**
  String get bankManualAccountUpdated;

  /// No description provided for @bankRemoveManualTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove {account}?'**
  String bankRemoveManualTitle(String account);

  /// No description provided for @bankRemoveManualDetail.
  ///
  /// In en, this message translates to:
  /// **'This removes the manual balance from FINVERSE. It does not affect any bank or financial institution.'**
  String get bankRemoveManualDetail;

  /// No description provided for @bankRemoveAction.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get bankRemoveAction;

  /// No description provided for @bankManualAccountRemoved.
  ///
  /// In en, this message translates to:
  /// **'Manual account removed.'**
  String get bankManualAccountRemoved;

  /// No description provided for @bankUnavailableInBuild.
  ///
  /// In en, this message translates to:
  /// **'Bank connection is not available in this build. Add accounts manually here instead.'**
  String get bankUnavailableInBuild;

  /// No description provided for @bankSetupIncomplete.
  ///
  /// In en, this message translates to:
  /// **'Bank connection setup is incomplete on this server. Finish the Plaid app configuration and try again.'**
  String get bankSetupIncomplete;

  /// No description provided for @bankProviderUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The bank provider is temporarily unavailable. Try again shortly.'**
  String get bankProviderUnavailable;

  /// No description provided for @bankCredentialsMissing.
  ///
  /// In en, this message translates to:
  /// **'This server has no Plaid credentials yet. Plaid Sandbox keys are free — see docs/11-run-on-your-phone.md.'**
  String get bankCredentialsMissing;

  /// No description provided for @bankAccountsTitle.
  ///
  /// In en, this message translates to:
  /// **'Accounts'**
  String get bankAccountsTitle;

  /// No description provided for @bankRefreshAction.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get bankRefreshAction;

  /// No description provided for @bankAddManualAction.
  ///
  /// In en, this message translates to:
  /// **'Add manual'**
  String get bankAddManualAction;

  /// No description provided for @bankSecureTitle.
  ///
  /// In en, this message translates to:
  /// **'Secure bank connection'**
  String get bankSecureTitle;

  /// No description provided for @bankSecureDetail.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE never sees or stores your bank password. Plaid handles sign-in and consent.'**
  String get bankSecureDetail;

  /// No description provided for @bankNetPositionSection.
  ///
  /// In en, this message translates to:
  /// **'ACCOUNTS IN YOUR NET POSITION'**
  String get bankNetPositionSection;

  /// No description provided for @bankNoBalancesTitle.
  ///
  /// In en, this message translates to:
  /// **'No balances yet'**
  String get bankNoBalancesTitle;

  /// No description provided for @bankNoBalancesDetail.
  ///
  /// In en, this message translates to:
  /// **'Connect a bank or add cash, an offline investment, or a loan manually.'**
  String get bankNoBalancesDetail;

  /// No description provided for @bankConnectionsSection.
  ///
  /// In en, this message translates to:
  /// **'BANK CONNECTIONS'**
  String get bankConnectionsSection;

  /// No description provided for @bankNoConnectionsTitle.
  ///
  /// In en, this message translates to:
  /// **'No bank connected yet'**
  String get bankNoConnectionsTitle;

  /// No description provided for @bankNoConnectionsDetail.
  ///
  /// In en, this message translates to:
  /// **'Connect a bank for automatic balances and transactions.'**
  String get bankNoConnectionsDetail;

  /// No description provided for @bankPlatformUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Not available in this build'**
  String get bankPlatformUnavailableTitle;

  /// No description provided for @bankPlatformUnavailableDetail.
  ///
  /// In en, this message translates to:
  /// **'Bank connection is not wired up for this platform yet. It works in the browser, Android, and iOS. You can still add your accounts and cards with \"Add manual\" and set budgets and goals against them.'**
  String get bankPlatformUnavailableDetail;

  /// No description provided for @bankManualAccountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{type} · Manual · {currency}'**
  String bankManualAccountSubtitle(String type, String currency);

  /// No description provided for @bankLinkedAccountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{type} · •••• {mask}'**
  String bankLinkedAccountSubtitle(String type, String mask);

  /// No description provided for @bankManualActionsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Manual account actions'**
  String get bankManualActionsTooltip;

  /// No description provided for @bankEditBalanceAction.
  ///
  /// In en, this message translates to:
  /// **'Edit balance'**
  String get bankEditBalanceAction;

  /// No description provided for @bankRemoveAccountAction.
  ///
  /// In en, this message translates to:
  /// **'Remove account'**
  String get bankRemoveAccountAction;

  /// No description provided for @bankTypeCreditCard.
  ///
  /// In en, this message translates to:
  /// **'Credit card'**
  String get bankTypeCreditCard;

  /// No description provided for @bankTypeChecking.
  ///
  /// In en, this message translates to:
  /// **'Chequing'**
  String get bankTypeChecking;

  /// No description provided for @bankTypeSavings.
  ///
  /// In en, this message translates to:
  /// **'Savings'**
  String get bankTypeSavings;

  /// No description provided for @bankTypeInvestment.
  ///
  /// In en, this message translates to:
  /// **'Investment'**
  String get bankTypeInvestment;

  /// No description provided for @bankTypeLoan.
  ///
  /// In en, this message translates to:
  /// **'Loan'**
  String get bankTypeLoan;

  /// No description provided for @bankTypeCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get bankTypeCash;

  /// No description provided for @bankReconnectAction.
  ///
  /// In en, this message translates to:
  /// **'Reconnect'**
  String get bankReconnectAction;

  /// No description provided for @bankSyncNowTooltip.
  ///
  /// In en, this message translates to:
  /// **'Sync now'**
  String get bankSyncNowTooltip;

  /// No description provided for @bankAccessRevokedStatus.
  ///
  /// In en, this message translates to:
  /// **'Access revoked - reconnect to resume'**
  String get bankAccessRevokedStatus;

  /// No description provided for @bankSignInNeedsAttention.
  ///
  /// In en, this message translates to:
  /// **'Sign-in needs attention'**
  String get bankSignInNeedsAttention;

  /// No description provided for @bankSyncingStatus.
  ///
  /// In en, this message translates to:
  /// **'Syncing…'**
  String get bankSyncingStatus;

  /// No description provided for @bankSyncError.
  ///
  /// In en, this message translates to:
  /// **'Sync error'**
  String get bankSyncError;

  /// No description provided for @bankSyncErrorWithCode.
  ///
  /// In en, this message translates to:
  /// **'Sync error · {code}'**
  String bankSyncErrorWithCode(String code);

  /// No description provided for @bankConnectedStatus.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get bankConnectedStatus;

  /// No description provided for @bankLastSynced.
  ///
  /// In en, this message translates to:
  /// **'Last synced {date}'**
  String bankLastSynced(String date);

  /// No description provided for @transactionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get transactionsTitle;

  /// No description provided for @transactionsSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search merchant or description'**
  String get transactionsSearchHint;

  /// No description provided for @transactionsFilterAction.
  ///
  /// In en, this message translates to:
  /// **'Filter transactions'**
  String get transactionsFilterAction;

  /// No description provided for @transactionsFiltersActive.
  ///
  /// In en, this message translates to:
  /// **'Filters ({count} active)'**
  String transactionsFiltersActive(num count);

  /// No description provided for @transactionsSearchAction.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get transactionsSearchAction;

  /// No description provided for @transactionsRetryAction.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get transactionsRetryAction;

  /// No description provided for @transactionsNoMatches.
  ///
  /// In en, this message translates to:
  /// **'No matching transactions.'**
  String get transactionsNoMatches;

  /// No description provided for @transactionsLoadOlderFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not load older transactions: {detail}'**
  String transactionsLoadOlderFailed(String detail);

  /// No description provided for @transactionsFilterTitle.
  ///
  /// In en, this message translates to:
  /// **'Filter transactions'**
  String get transactionsFilterTitle;

  /// No description provided for @transactionsMoneyTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Money type'**
  String get transactionsMoneyTypeLabel;

  /// No description provided for @transactionsAllTypes.
  ///
  /// In en, this message translates to:
  /// **'All types'**
  String get transactionsAllTypes;

  /// No description provided for @transactionsSpending.
  ///
  /// In en, this message translates to:
  /// **'Spending'**
  String get transactionsSpending;

  /// No description provided for @transactionsIncome.
  ///
  /// In en, this message translates to:
  /// **'Income'**
  String get transactionsIncome;

  /// No description provided for @transactionsTransfers.
  ///
  /// In en, this message translates to:
  /// **'Transfers'**
  String get transactionsTransfers;

  /// No description provided for @transactionsCategoryLabel.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get transactionsCategoryLabel;

  /// No description provided for @transactionsAllCategories.
  ///
  /// In en, this message translates to:
  /// **'All categories'**
  String get transactionsAllCategories;

  /// No description provided for @transactionsAccountLabel.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get transactionsAccountLabel;

  /// No description provided for @transactionsAllAccounts.
  ///
  /// In en, this message translates to:
  /// **'All accounts'**
  String get transactionsAllAccounts;

  /// No description provided for @transactionsStatusLabel.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get transactionsStatusLabel;

  /// No description provided for @transactionsAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get transactionsAll;

  /// No description provided for @transactionsPosted.
  ///
  /// In en, this message translates to:
  /// **'Posted'**
  String get transactionsPosted;

  /// No description provided for @transactionsPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get transactionsPending;

  /// No description provided for @transactionsFrequencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Frequency'**
  String get transactionsFrequencyLabel;

  /// No description provided for @transactionsRecurring.
  ///
  /// In en, this message translates to:
  /// **'Recurring'**
  String get transactionsRecurring;

  /// No description provided for @transactionsOneOff.
  ///
  /// In en, this message translates to:
  /// **'One-off'**
  String get transactionsOneOff;

  /// No description provided for @transactionsMinAmountLabel.
  ///
  /// In en, this message translates to:
  /// **'Min amount'**
  String get transactionsMinAmountLabel;

  /// No description provided for @transactionsMaxAmountLabel.
  ///
  /// In en, this message translates to:
  /// **'Max amount'**
  String get transactionsMaxAmountLabel;

  /// No description provided for @transactionsMinorUnits.
  ///
  /// In en, this message translates to:
  /// **'Minor units'**
  String get transactionsMinorUnits;

  /// No description provided for @transactionsFrom.
  ///
  /// In en, this message translates to:
  /// **'From: {date}'**
  String transactionsFrom(String date);

  /// No description provided for @transactionsTo.
  ///
  /// In en, this message translates to:
  /// **'To: {date}'**
  String transactionsTo(String date);

  /// No description provided for @transactionsChooseDate.
  ///
  /// In en, this message translates to:
  /// **'Choose date'**
  String get transactionsChooseDate;

  /// No description provided for @transactionsInvalidAmounts.
  ///
  /// In en, this message translates to:
  /// **'Amounts must be whole minor-unit values.'**
  String get transactionsInvalidAmounts;

  /// No description provided for @transactionsAmountRangeInvalid.
  ///
  /// In en, this message translates to:
  /// **'Minimum amount cannot exceed maximum.'**
  String get transactionsAmountRangeInvalid;

  /// No description provided for @transactionsDateRangeInvalid.
  ///
  /// In en, this message translates to:
  /// **'The start date must be before the end date.'**
  String get transactionsDateRangeInvalid;

  /// No description provided for @transactionsClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get transactionsClearFilters;

  /// No description provided for @transactionsApplyFilters.
  ///
  /// In en, this message translates to:
  /// **'Apply filters'**
  String get transactionsApplyFilters;

  /// No description provided for @helpDiagnosticsTitle.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE support diagnostics'**
  String get helpDiagnosticsTitle;

  /// No description provided for @helpDiagnosticsApiOrigin.
  ///
  /// In en, this message translates to:
  /// **'API origin: {origin}'**
  String helpDiagnosticsApiOrigin(String origin);

  /// No description provided for @helpDiagnosticsResult.
  ///
  /// In en, this message translates to:
  /// **'Result: {result}'**
  String helpDiagnosticsResult(String result);

  /// No description provided for @helpDiagnosticsNotChecked.
  ///
  /// In en, this message translates to:
  /// **'Not checked'**
  String get helpDiagnosticsNotChecked;

  /// No description provided for @helpDiagnosticsHttpStatus.
  ///
  /// In en, this message translates to:
  /// **'HTTP status: {status}'**
  String helpDiagnosticsHttpStatus(num status);

  /// No description provided for @helpDiagnosticsChecked.
  ///
  /// In en, this message translates to:
  /// **'Checked: {date}'**
  String helpDiagnosticsChecked(String date);

  /// No description provided for @helpDiagnosticsCopied.
  ///
  /// In en, this message translates to:
  /// **'Diagnostics copied to the clipboard.'**
  String get helpDiagnosticsCopied;

  /// No description provided for @helpSupportNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Support contact is not configured for this build.'**
  String get helpSupportNotConfigured;

  /// No description provided for @helpNoEmailApp.
  ///
  /// In en, this message translates to:
  /// **'No email app is available on this device.'**
  String get helpNoEmailApp;

  /// No description provided for @helpEmailSubject.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE support request'**
  String get helpEmailSubject;

  /// No description provided for @helpHeading.
  ///
  /// In en, this message translates to:
  /// **'Get unstuck quickly'**
  String get helpHeading;

  /// No description provided for @helpPrivacyDetail.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE keeps your bank credentials with the provider. These checks never include your password, access token, or transaction data.'**
  String get helpPrivacyDetail;

  /// No description provided for @helpQuestionsSection.
  ///
  /// In en, this message translates to:
  /// **'COMMON QUESTIONS'**
  String get helpQuestionsSection;

  /// No description provided for @helpIphoneQuestion.
  ///
  /// In en, this message translates to:
  /// **'My iPhone cannot connect'**
  String get helpIphoneQuestion;

  /// No description provided for @helpIphoneAnswer.
  ///
  /// In en, this message translates to:
  /// **'A release build must point to the public HTTPS API origin. If it was built with a local address, rebuild it with the API_BASE_URL value supplied by the deployment. Tailscale is not required for a public deployment.'**
  String get helpIphoneAnswer;

  /// No description provided for @helpBankQuestion.
  ///
  /// In en, this message translates to:
  /// **'My bank needs attention'**
  String get helpBankQuestion;

  /// No description provided for @helpBankAnswer.
  ///
  /// In en, this message translates to:
  /// **'Open Settings → Bank connections and choose Reconnect. You will confirm your FINVERSE password first, then Plaid will ask you to sign in with the institution again. Existing transactions stay in your history.'**
  String get helpBankAnswer;

  /// No description provided for @helpSessionQuestion.
  ///
  /// In en, this message translates to:
  /// **'I left the app and it asked me to sign in'**
  String get helpSessionQuestion;

  /// No description provided for @helpSessionAnswer.
  ///
  /// In en, this message translates to:
  /// **'FINVERSE stores the rotating session credentials in the phone keystore. Unlock the phone once after a restart, then use Try again. A revoked or expired session requires a fresh sign-in for your protection.'**
  String get helpSessionAnswer;

  /// No description provided for @helpOfflineQuestion.
  ///
  /// In en, this message translates to:
  /// **'What works offline?'**
  String get helpOfflineQuestion;

  /// No description provided for @helpOfflineAnswer.
  ///
  /// In en, this message translates to:
  /// **'Recent authenticated reads can be shown from encrypted device cache. Transaction preference edits are queued and replayed later. Balances, bank sync, and other server-authoritative changes wait for a connection.'**
  String get helpOfflineAnswer;

  /// No description provided for @helpDeleteQuestion.
  ///
  /// In en, this message translates to:
  /// **'How do I remove my account?'**
  String get helpDeleteQuestion;

  /// No description provided for @helpDeleteAnswer.
  ///
  /// In en, this message translates to:
  /// **'Open Settings → Delete account. FINVERSE revokes sessions immediately and schedules permanent erasure after the recovery window described in the privacy notice.'**
  String get helpDeleteAnswer;

  /// No description provided for @helpCopyDiagnostics.
  ///
  /// In en, this message translates to:
  /// **'Copy diagnostics'**
  String get helpCopyDiagnostics;

  /// No description provided for @helpContactSupport.
  ///
  /// In en, this message translates to:
  /// **'Contact support'**
  String get helpContactSupport;

  /// No description provided for @helpConnectionNotChecked.
  ///
  /// In en, this message translates to:
  /// **'Connection not checked yet'**
  String get helpConnectionNotChecked;

  /// No description provided for @helpCheckConnection.
  ///
  /// In en, this message translates to:
  /// **'Check connection'**
  String get helpCheckConnection;

  /// No description provided for @planEntitlementMultipleInstitutions.
  ///
  /// In en, this message translates to:
  /// **'Connect multiple institutions'**
  String get planEntitlementMultipleInstitutions;

  /// No description provided for @planEntitlementMonthlyPdf.
  ///
  /// In en, this message translates to:
  /// **'Monthly PDF report'**
  String get planEntitlementMonthlyPdf;

  /// No description provided for @planEntitlementCashFlow.
  ///
  /// In en, this message translates to:
  /// **'Cash-flow forecast and purchase planning'**
  String get planEntitlementCashFlow;

  /// No description provided for @planEntitlementDataExport.
  ///
  /// In en, this message translates to:
  /// **'Full data export'**
  String get planEntitlementDataExport;

  /// No description provided for @planCheckoutPending.
  ///
  /// In en, this message translates to:
  /// **'Finish in your browser. Your plan updates here once the payment is confirmed.'**
  String get planCheckoutPending;

  /// No description provided for @planCouldNotOpen.
  ///
  /// In en, this message translates to:
  /// **'Could not open {destination}.'**
  String planCouldNotOpen(String destination);

  /// No description provided for @planCheckout.
  ///
  /// In en, this message translates to:
  /// **'checkout'**
  String get planCheckout;

  /// No description provided for @planBillingPortal.
  ///
  /// In en, this message translates to:
  /// **'the billing portal'**
  String get planBillingPortal;

  /// No description provided for @planBillingNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Billing is not configured on this server yet.'**
  String get planBillingNotConfigured;

  /// No description provided for @planRefreshAction.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get planRefreshAction;

  /// No description provided for @planLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not load your plan'**
  String get planLoadFailed;

  /// No description provided for @planTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get planTryAgain;

  /// No description provided for @planEverythingAvailable.
  ///
  /// In en, this message translates to:
  /// **'Everything is available'**
  String get planEverythingAvailable;

  /// No description provided for @planNoLimits.
  ///
  /// In en, this message translates to:
  /// **'This server does not limit features by plan. You can connect up to {limit} institutions and use every feature.'**
  String planNoLimits(num limit);

  /// No description provided for @planIncludesSection.
  ///
  /// In en, this message translates to:
  /// **'WHAT EACH PLAN INCLUDES'**
  String get planIncludesSection;

  /// No description provided for @planPaidUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Paid plans are not available on this server.'**
  String get planPaidUnavailable;

  /// No description provided for @planYearly.
  ///
  /// In en, this message translates to:
  /// **'Yearly'**
  String get planYearly;

  /// No description provided for @planMonthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get planMonthly;

  /// No description provided for @planCurrentSection.
  ///
  /// In en, this message translates to:
  /// **'CURRENT PLAN'**
  String get planCurrentSection;

  /// No description provided for @planManageSubscription.
  ///
  /// In en, this message translates to:
  /// **'Manage subscription'**
  String get planManageSubscription;

  /// No description provided for @planPaymentProblem.
  ///
  /// In en, this message translates to:
  /// **'Payment problem'**
  String get planPaymentProblem;

  /// No description provided for @planPaymentProblemDetail.
  ///
  /// In en, this message translates to:
  /// **'We could not take your last payment. Your plan is still active while we retry — update your card to keep it.'**
  String get planPaymentProblemDetail;

  /// No description provided for @planFreeLimit.
  ///
  /// In en, this message translates to:
  /// **'Connect up to {limit} {institutions}.'**
  String planFreeLimit(num limit, String institutions);

  /// No description provided for @planEnds.
  ///
  /// In en, this message translates to:
  /// **'Ends {date}. You keep everything until then.'**
  String planEnds(String date);

  /// No description provided for @planTrialEnds.
  ///
  /// In en, this message translates to:
  /// **'Trial ends {date}.'**
  String planTrialEnds(String date);

  /// No description provided for @planRenews.
  ///
  /// In en, this message translates to:
  /// **'Renews {date}.'**
  String planRenews(String date);

  /// No description provided for @planActive.
  ///
  /// In en, this message translates to:
  /// **'Active.'**
  String get planActive;

  /// No description provided for @planCurrentChip.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get planCurrentChip;

  /// No description provided for @planConnectedInstitutions.
  ///
  /// In en, this message translates to:
  /// **'{count} connected {institutions}'**
  String planConnectedInstitutions(num count, String institutions);

  /// No description provided for @planStartTrial.
  ///
  /// In en, this message translates to:
  /// **'Start {days}-day free trial'**
  String planStartTrial(num days);

  /// No description provided for @planUpgradeTo.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to {plan}'**
  String planUpgradeTo(String plan);

  /// No description provided for @planTrialTerms.
  ///
  /// In en, this message translates to:
  /// **'Then billed {interval}. Cancel any time before it ends.'**
  String planTrialTerms(String interval);

  /// No description provided for @planPaidFeature.
  ///
  /// In en, this message translates to:
  /// **'Included in a paid plan'**
  String get planPaidFeature;

  /// No description provided for @planNotNow.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get planNotNow;

  /// No description provided for @planSeePlans.
  ///
  /// In en, this message translates to:
  /// **'See plans'**
  String get planSeePlans;

  /// No description provided for @planWebPurchaseUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Subscriptions are managed on the web. Sign in at your FINVERSE account page to upgrade.'**
  String get planWebPurchaseUnavailable;

  /// No description provided for @planNativePurchaseUnavailable.
  ///
  /// In en, this message translates to:
  /// **'In-app purchasing is not available in this build yet.'**
  String get planNativePurchaseUnavailable;

  /// No description provided for @transactionTileChangeCategory.
  ///
  /// In en, this message translates to:
  /// **'Change category'**
  String get transactionTileChangeCategory;

  /// No description provided for @transactionTilePending.
  ///
  /// In en, this message translates to:
  /// **'pending'**
  String get transactionTilePending;

  /// No description provided for @transactionTileReview.
  ///
  /// In en, this message translates to:
  /// **'review'**
  String get transactionTileReview;

  /// No description provided for @transactionTileExcluded.
  ///
  /// In en, this message translates to:
  /// **'excluded'**
  String get transactionTileExcluded;

  /// No description provided for @transactionCategoryGroceries.
  ///
  /// In en, this message translates to:
  /// **'groceries'**
  String get transactionCategoryGroceries;

  /// No description provided for @transactionCategoryRestaurants.
  ///
  /// In en, this message translates to:
  /// **'restaurants'**
  String get transactionCategoryRestaurants;

  /// No description provided for @transactionCategoryCoffee.
  ///
  /// In en, this message translates to:
  /// **'coffee'**
  String get transactionCategoryCoffee;

  /// No description provided for @transactionCategoryFoodDelivery.
  ///
  /// In en, this message translates to:
  /// **'food delivery'**
  String get transactionCategoryFoodDelivery;

  /// No description provided for @transactionCategoryFuel.
  ///
  /// In en, this message translates to:
  /// **'fuel'**
  String get transactionCategoryFuel;

  /// No description provided for @transactionCategoryRideshare.
  ///
  /// In en, this message translates to:
  /// **'rideshare'**
  String get transactionCategoryRideshare;

  /// No description provided for @transactionCategoryShopping.
  ///
  /// In en, this message translates to:
  /// **'shopping'**
  String get transactionCategoryShopping;

  /// No description provided for @transactionCategoryRent.
  ///
  /// In en, this message translates to:
  /// **'rent'**
  String get transactionCategoryRent;

  /// No description provided for @transactionCategoryUtilities.
  ///
  /// In en, this message translates to:
  /// **'utilities'**
  String get transactionCategoryUtilities;

  /// No description provided for @transactionCategoryStreaming.
  ///
  /// In en, this message translates to:
  /// **'streaming'**
  String get transactionCategoryStreaming;

  /// No description provided for @transactionCategoryFitness.
  ///
  /// In en, this message translates to:
  /// **'fitness'**
  String get transactionCategoryFitness;

  /// No description provided for @transactionCategoryHealthcare.
  ///
  /// In en, this message translates to:
  /// **'healthcare'**
  String get transactionCategoryHealthcare;

  /// No description provided for @dashboardNetCashFlow.
  ///
  /// In en, this message translates to:
  /// **'Net cash flow'**
  String get dashboardNetCashFlow;

  /// No description provided for @dashboardComparedWithPeriod.
  ///
  /// In en, this message translates to:
  /// **'Compared with last period'**
  String get dashboardComparedWithPeriod;

  /// No description provided for @dashboardRecentTransactions.
  ///
  /// In en, this message translates to:
  /// **'Recent transactions'**
  String get dashboardRecentTransactions;

  /// No description provided for @dashboardFinancialHealth.
  ///
  /// In en, this message translates to:
  /// **'Financial health'**
  String get dashboardFinancialHealth;

  /// No description provided for @dashboardInsights.
  ///
  /// In en, this message translates to:
  /// **'Insights'**
  String get dashboardInsights;
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
