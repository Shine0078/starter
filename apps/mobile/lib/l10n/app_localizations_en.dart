// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'FINVERSE';

  @override
  String get navHome => 'Home';

  @override
  String get navTransactions => 'Transactions';

  @override
  String get navAnalytics => 'Analytics';

  @override
  String get navAccounts => 'Accounts';

  @override
  String get navProfile => 'Profile';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSave => 'Save';

  @override
  String get commonSignOut => 'Sign out';

  @override
  String get commonSearch => 'Search';

  @override
  String get commonBack => 'Back';

  @override
  String get signInTitle => 'Sign in to FINVERSE';

  @override
  String get signInAction => 'Sign in';

  @override
  String get registerAction => 'Create account';

  @override
  String get emailLabel => 'Email';

  @override
  String get passwordLabel => 'Password';

  @override
  String get offlineBannerTitle => 'Offline - showing saved data';

  @override
  String get offlineBannerPending => 'Offline changes pending';

  @override
  String offlineBannerPendingDetail(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count changes saved on this device and will sync automatically when you are online.',
      one:
          '1 change saved on this device and will sync automatically when you are online.',
    );
    return '$_temp0';
  }

  @override
  String offlineBannerLastUpdated(Object date) {
    return 'Last updated $date. Changes are read-only until you reconnect.';
  }

  @override
  String get settingsTitle => 'Settings';

  @override
  String get profileTitle => 'Profile';

  @override
  String get privacyTitle => 'Privacy';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get bankConnectionsTitle => 'Bank connections';

  @override
  String get budgetsTitle => 'Budgets';

  @override
  String get goalsTitle => 'Goals';

  @override
  String get planTitle => 'Plan';

  @override
  String get helpTitle => 'Help & support';

  @override
  String get languageTitle => 'Language';

  @override
  String get languageSystemDefault => 'Use device language';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageFrench => 'French';

  @override
  String get languageBetaDetail => 'Some screens are still being translated.';

  @override
  String get verificationEmailSent => 'Verification email sent.';

  @override
  String get profileSettingsPrivacyTitle => 'Settings and privacy';

  @override
  String get profileSettingsPrivacyDetail =>
      'Security, MFA, app lock, consent, export, and account controls';

  @override
  String get profilePlanningSection => 'Planning';

  @override
  String get profileBudgetDetail => 'Set limits and track category progress';

  @override
  String get profileGoalsDetail => 'Build savings targets and contributions';

  @override
  String get profileCashFlowPlanningTitle => 'Cash-flow planning';

  @override
  String get profileCashFlowPlanningDetail =>
      'Forecast balances and simulate purchases';

  @override
  String get profileFinancialCalendarTitle => 'Financial calendar';

  @override
  String get profileFinancialCalendarDetail =>
      'See bills, income, goal dates, and warnings';

  @override
  String get profileInsightsSection => 'Insights and alerts';

  @override
  String get profileAnalyticsDetail => 'Explore trends, categories, and health';

  @override
  String get profileSubscriptionsTitle => 'Subscriptions';

  @override
  String get profileSubscriptionsDetail =>
      'Review recurring costs and price changes';

  @override
  String get profileNotificationsDetail =>
      'Review alerts and notification preferences';

  @override
  String get profileCategorizationRulesTitle => 'Categorization rules';

  @override
  String get profileCategorizationRulesDetail =>
      'Review or remove saved merchant rules';

  @override
  String get errorConnection =>
      'Couldn\'t reach the server. Check your connection.';

  @override
  String get errorServerUnavailable =>
      'The server is temporarily unavailable. Try again shortly.';

  @override
  String get errorSessionInvalid =>
      'Your session is no longer valid. Sign in again.';

  @override
  String get errorServerSide =>
      'Something went wrong on our side. Try again shortly.';

  @override
  String get errorTimeout =>
      'The server did not respond. Check your connection and try again.';

  @override
  String categoryExplanationLearned(num percent) {
    return 'Learned from a similar merchant you categorized before • $percent% confidence.';
  }

  @override
  String get receiptScanPhoto => 'Scan a receipt photo';

  @override
  String get receiptScanPhotoDetail =>
      'Recognized on this phone — the image is never uploaded';

  @override
  String get receiptPasteText => 'Paste receipt text';

  @override
  String get receiptPasteTextDetail =>
      'Use text copied from a receipt or your phone’s OCR';

  @override
  String get receiptTakePhoto => 'Take a photo';

  @override
  String get receiptChoosePhoto => 'Choose from your photos';

  @override
  String get receiptReviewScanned => 'Review scanned receipt text';

  @override
  String get receiptPasteExplanation =>
      'Paste receipt text. FINVERSE extracts the merchant, date, total, and tax. Images are never uploaded.';

  @override
  String get receiptReviewExplanation =>
      'Check the recognized text before attaching it. Only this text is sent to FINVERSE — never the photo.';

  @override
  String get receiptAttachAction => 'Attach';
}
