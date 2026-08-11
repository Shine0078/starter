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
  String get commonDelete => 'Delete';

  @override
  String get assistantTitle => 'Ask FINVERSE';

  @override
  String get assistantHeading => 'A clear view of your money';

  @override
  String get assistantDescription =>
      'Ask about spending, savings, merchants, or recurring charges. Answers use your selected-period aggregates and stay on FINVERSE.';

  @override
  String get assistantQuestionLabel => 'Your question';

  @override
  String get assistantQuestionHint => 'Where did I spend the most?';

  @override
  String get assistantAskTooltip => 'Ask';

  @override
  String get assistantPromptHeading => 'Try one of these';

  @override
  String get assistantPromptSpending => 'Where did I spend the most?';

  @override
  String get assistantPromptSavings => 'How much did I save?';

  @override
  String get assistantPromptSubscriptions =>
      'Which subscriptions am I paying for?';

  @override
  String get assistantPromptHigherSpending =>
      'Is my spending higher than usual?';

  @override
  String get assistantQuestionRequired =>
      'Ask a question about your spending or savings.';

  @override
  String get assistantCouldNotAnswer => 'Could not answer that yet';

  @override
  String get assistantAnswerTitle => 'Your answer';

  @override
  String get notificationsMarkAllRead => 'Mark all read';

  @override
  String get notificationsPreferencesTooltip => 'Notification preferences';

  @override
  String get notificationsEmptyTitle => 'You are all caught up';

  @override
  String get notificationsEmptyDetail =>
      'Budget, bill, subscription, unusual spending, balance, credit, and security alerts will appear here.';

  @override
  String notificationsMarkedRead(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count alerts marked as read.',
      one: '1 alert marked as read.',
    );
    return '$_temp0';
  }

  @override
  String get notificationPreferencesTitle => 'Alert preferences';

  @override
  String get notificationPermissionDenied =>
      'Notifications are disabled. Enable them in your device settings.';

  @override
  String get notificationBudgetProgress => 'Budget progress';

  @override
  String get notificationBills => 'Bills and due dates';

  @override
  String get notificationCreditUtilization => 'Credit utilization';

  @override
  String get notificationSubscriptionChanges => 'Subscription changes';

  @override
  String get notificationLowBalance => 'Low balance';

  @override
  String get notificationUnusualTransactions => 'Unusual transactions';

  @override
  String get notificationBankSync => 'Bank synchronization';

  @override
  String get notificationSecurityEvents => 'Security events';

  @override
  String get notificationDeviceUnavailable => 'Device alerts unavailable here';

  @override
  String get notificationDeviceUnavailableDetail =>
      'Native alerts are available in the Android and iPhone apps.';

  @override
  String get notificationDeviceAlerts => 'Device alerts';

  @override
  String get notificationDeviceAlertsEnabled =>
      'Unread FINVERSE alerts can appear in your notification tray.';

  @override
  String get notificationDeviceAlertsDisabled =>
      'Allow local alerts for unread budgets, bills, banks, and security events.';

  @override
  String get notificationTurnOff => 'Turn off';

  @override
  String get notificationEnable => 'Enable';

  @override
  String get categorizationRulesDeleteTitle => 'Delete this rule?';

  @override
  String categorizationRulesDeleteDescription(String pattern, String category) {
    return 'Future matching transactions will use the normal categorization pipeline again. Existing transaction choices stay unchanged.\n\n“$pattern” → $category';
  }

  @override
  String get categorizationRulesKeep => 'Keep rule';

  @override
  String get categorizationRulesDeleted => 'Rule deleted.';

  @override
  String categorizationRulesDeleteFailed(String detail) {
    return 'Could not delete this rule. $detail';
  }

  @override
  String get categorizationRulesEmptyTitle => 'No saved rules yet';

  @override
  String get categorizationRulesEmptyDetail =>
      'When you correct a transaction category, FINVERSE can remember that choice for matching merchants.';

  @override
  String get categorizationRulesIntro =>
      'These rules apply to your account on every device. Deleting a rule does not rewrite the original bank record or existing edits.';

  @override
  String get categorizationRulesDeleteTooltip => 'Delete rule';

  @override
  String get subscriptionsRefreshTooltip => 'Refresh subscriptions';

  @override
  String get subscriptionsLoadError => 'Could not load subscriptions';

  @override
  String subscriptionsRecurringCount(num count, String currency) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count recurring payments in $currency',
      one: '1 recurring payment in $currency',
    );
    return '$_temp0';
  }

  @override
  String get subscriptionsEstimatedMonthly => 'Estimated monthly';

  @override
  String get subscriptionsEstimatedYearly => 'Estimated yearly';

  @override
  String get subscriptionsPriceChanges => 'PRICE CHANGES';

  @override
  String subscriptionsPriceIncrease(String merchant, num percent) {
    return '$merchant increased $percent%';
  }

  @override
  String subscriptionsAnnualImpact(String from, String to, String impact) {
    return '$from to $to · $impact yearly impact';
  }

  @override
  String get subscriptionsDetected => 'DETECTED';

  @override
  String get subscriptionsEmptyTitle => 'No recurring subscriptions detected.';

  @override
  String get subscriptionsEmptyDetail =>
      'Connect and sync a bank with at least a few months of transactions.';

  @override
  String subscriptionsNextExpected(String date) {
    return 'Next expected $date';
  }

  @override
  String get subscriptionsPerYear => '/year';

  @override
  String get subscriptionsMayHaveEnded => 'MAY HAVE ENDED';

  @override
  String get subscriptionsDisclaimer =>
      'Subscriptions are detected from transaction patterns. Confirm charges with the merchant before taking action.';

  @override
  String get subscriptionsCadenceWeekly => 'Weekly';

  @override
  String get subscriptionsCadenceBiweekly => 'Every two weeks';

  @override
  String get subscriptionsCadenceMonthly => 'Monthly';

  @override
  String get subscriptionsCadenceQuarterly => 'Quarterly';

  @override
  String get subscriptionsCadenceAnnual => 'Yearly';

  @override
  String get calendarRefreshTooltip => 'Refresh calendar';

  @override
  String get calendarDisclaimer =>
      'This view uses repeatable income and recurring bills only. Actual balances can differ when everyday spending or a bank sync is missing.';

  @override
  String get calendarNextNinetyDays => 'Next 90 days';

  @override
  String calendarExpectedEventCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count expected events',
      one: '1 expected event',
      zero: 'No expected events',
    );
    return '$_temp0';
  }

  @override
  String calendarLowBalanceDateCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count low-balance dates',
      one: '1 low-balance date',
      zero: 'no low-balance dates',
    );
    return '$_temp0';
  }

  @override
  String get calendarStartingBalance => 'Starting balance';

  @override
  String get calendarProjectedEnding => 'Projected ending';

  @override
  String get calendarPreviousMonth => 'Previous month';

  @override
  String get calendarNextMonth => 'Next month';

  @override
  String calendarOutsideForecast(String date) {
    return '$date outside forecast';
  }

  @override
  String calendarGoalTarget(String name) {
    return 'Savings goal target, $name';
  }

  @override
  String get calendarNoExpectedEvents => 'No expected events';

  @override
  String get calendarProjectedLowBalance => 'Projected low balance';

  @override
  String get calendarProjectedLowBalanceSemantics => 'projected low balance';

  @override
  String get calendarLowBalanceDetail =>
      'Review bills or plan a buffer before this date.';

  @override
  String get calendarSelectDate => 'Select a forecast date';

  @override
  String get calendarSelectDateDetail =>
      'Tap a highlighted day to see expected events.';

  @override
  String get calendarExpectedIncome => 'Expected income';

  @override
  String get calendarExpectedBill => 'Expected bill';

  @override
  String calendarPatternConfidence(num percent) {
    return '$percent% pattern confidence';
  }

  @override
  String calendarGoalProgress(String remaining) {
    return 'Savings goal target · $remaining remaining';
  }

  @override
  String calendarSuggestedMonthly(String amount) {
    return '$amount suggested monthly';
  }

  @override
  String get calendarUnavailable => 'Calendar is unavailable';

  @override
  String get calendarUnavailableDetail =>
      'Check your connection and try again.';

  @override
  String get commonCreate => 'Create';

  @override
  String get commonAdd => 'Add';

  @override
  String get commonRemove => 'Remove';

  @override
  String get commonVerify => 'Verify';

  @override
  String get budgetCreateTitle => 'Create monthly budget';

  @override
  String get budgetCategory => 'Category';

  @override
  String get budgetMonthlyLimit => 'Monthly limit (dollars)';

  @override
  String get budgetPositiveAmount => 'Enter a positive dollar amount.';

  @override
  String budgetSaveFailed(String detail) {
    return 'Could not save budget. $detail';
  }

  @override
  String get budgetNew => 'New budget';

  @override
  String get budgetEmpty => 'Create a budget to start tracking progress.';

  @override
  String get budgetRemoveTitle => 'Remove this budget?';

  @override
  String budgetStopTracking(String category) {
    return 'Stop tracking $category?';
  }

  @override
  String budgetRemoveFailed(String detail) {
    return 'Could not remove budget. $detail';
  }

  @override
  String get goalCreateTitle => 'Create savings goal';

  @override
  String get goalName => 'Goal name';

  @override
  String get goalTargetAmount => 'Target amount';

  @override
  String get goalAlreadySaved => 'Already saved';

  @override
  String get goalTargetDate => 'Target date (YYYY-MM-DD, optional)';

  @override
  String get goalEnterValid => 'Enter a name and valid positive target.';

  @override
  String goalCreateFailed(String detail) {
    return 'Could not create goal. $detail';
  }

  @override
  String goalAddTo(String name) {
    return 'Add to $name';
  }

  @override
  String get goalContributionAmount => 'Contribution amount';

  @override
  String get goalNew => 'New goal';

  @override
  String get goalEmpty => 'Create a goal and turn saving into a plan.';

  @override
  String goalSavedOf(String saved, String target) {
    return '$saved saved of $target';
  }

  @override
  String goalRemaining(String amount) {
    return '$amount remaining';
  }

  @override
  String goalMonthlyTarget(String amount) {
    return '$amount/month reaches the target date.';
  }

  @override
  String get goalCompleted => 'Completed';

  @override
  String get goalAddSavings => 'Add savings';

  @override
  String get planningPositiveAmount =>
      'Enter a positive amount with at most two decimals.';

  @override
  String get planningOpenCalendar => 'Open financial calendar';

  @override
  String get planningConservativeForecast => 'Conservative forecast';

  @override
  String get planningForecastDetail =>
      'Repeatable income and bills only. Everyday spending is not predicted.';

  @override
  String get planningToday => 'Today';

  @override
  String get planningEnd => 'End';

  @override
  String planningForecastSemantics(String start, String end, String detail) {
    return 'Cash flow forecast from $start to $end. $detail';
  }

  @override
  String get planningNoNegativeBalance => 'No modeled negative balance dates.';

  @override
  String planningNegativeBalanceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count modeled negative balance dates.',
      one: '1 modeled negative balance date.',
    );
    return '$_temp0';
  }

  @override
  String planningProjectedLowBalanceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count projected low-balance days',
      one: '1 projected low-balance day',
    );
    return '$_temp0';
  }

  @override
  String get planningAffordPurchase => 'Can I afford a purchase?';

  @override
  String planningPurchaseAmount(String currency) {
    return 'Purchase amount ($currency)';
  }

  @override
  String get planningPurchaseDate => 'Purchase date';

  @override
  String get planningChecking => 'Checking…';

  @override
  String get planningCheckScenario => 'Check scenario';

  @override
  String get planningAfterPurchase => 'After purchase';

  @override
  String get planningEndForecast => 'End of forecast';

  @override
  String get planningExpectedEvents => 'Expected recurring events';

  @override
  String get planningNoPattern => 'No strong recurring pattern was found.';

  @override
  String get analyticsRefreshTooltip => 'Refresh analytics';

  @override
  String get analyticsUnavailable => 'Analytics are unavailable';

  @override
  String get analyticsUnavailableDetail =>
      'Check your connection and try again. Nothing has been lost.';

  @override
  String get analyticsPeriodLabel => 'Analytics period';

  @override
  String get analyticsThisWeek => 'This week';

  @override
  String get analyticsThisMonth => 'This month';

  @override
  String get analyticsLastThreeMonths => 'Last 3 months';

  @override
  String get analyticsLastSixMonths => 'Last 6 months';

  @override
  String get analyticsLastYear => 'Last year';

  @override
  String get analyticsAllHistory => 'All history';

  @override
  String get analyticsCustomRange => 'Custom range';

  @override
  String get analyticsChooseFirstDay => 'Choose the first day';

  @override
  String get analyticsChooseLastDay => 'Choose the last day';

  @override
  String get analyticsHistoryEmptyTitle => 'Not enough transaction history yet';

  @override
  String get analyticsHistoryEmptyDetail =>
      'Connect a bank or add transactions to see trends.';

  @override
  String get analyticsExplainableInsights => 'Explainable insights';

  @override
  String analyticsEvidenceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count transactions',
      one: '1 transaction',
    );
    return 'Based on $_temp0';
  }

  @override
  String get analyticsTimeline => 'Financial timeline';

  @override
  String get analyticsPlanAction => 'Plan a purchase or view your forecast';

  @override
  String get analyticsIncome => 'Income';

  @override
  String get analyticsNetExpenses => 'Net expenses';

  @override
  String get analyticsSavings => 'Savings';

  @override
  String get analyticsSavingsRate => 'Savings rate';

  @override
  String get analyticsPaceNoHistory =>
      'Keep using FINVERSE to build a useful historical baseline.';

  @override
  String get analyticsPaceNoComparison =>
      'There is not enough comparable history for a pace comparison.';

  @override
  String analyticsPaceProjected(String percent, String direction) {
    return 'Projected spending is $percent% $direction your historical pace.';
  }

  @override
  String get analyticsPaceAbove => 'above';

  @override
  String get analyticsPaceBelow => 'below';

  @override
  String analyticsPaceTitle(String amount) {
    return 'Spending pace: $amount';
  }

  @override
  String analyticsPaceCurrent(String amount) {
    return 'Current: $amount';
  }

  @override
  String get analyticsRefundsMatched => 'Refunds matched';

  @override
  String get analyticsRefundsDetail =>
      'These refunds were linked to earlier purchases using merchant and amount evidence.';

  @override
  String analyticsRefundRow(String amount, num days) {
    return '$amount refunded · $days days after purchase';
  }

  @override
  String analyticsRecurringCharges(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count recurring charges',
      one: '1 recurring charge',
    );
    return '$_temp0';
  }

  @override
  String analyticsSubscriptionTotals(String monthly, String yearly) {
    return '$monthly/month · $yearly/year';
  }

  @override
  String analyticsPriceRiseCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count price rises',
      one: '1 price rise',
    );
    return '$_temp0';
  }

  @override
  String get analyticsPriorityCritical => 'Critical';

  @override
  String get analyticsPriorityImportant => 'Important';

  @override
  String get analyticsPriorityInfo => 'Info';

  @override
  String get onboardingSkip => 'Skip';

  @override
  String get onboardingMoneyTitle => 'See your money clearly';

  @override
  String get onboardingMoneyDetail =>
      'Bring accounts and transactions into one private view, then understand where every dollar is going.';

  @override
  String get onboardingProgressTitle => 'Turn plans into progress';

  @override
  String get onboardingProgressDetail =>
      'Set budgets and savings goals, monitor subscriptions, and get useful alerts before small problems grow.';

  @override
  String get onboardingPrivacyTitle => 'Connect without sharing credentials';

  @override
  String get onboardingPrivacyDetail =>
      'Plaid handles bank sign-in. FINVERSE never receives your bank password and encrypts provider access tokens.';

  @override
  String get onboardingGetStarted => 'Get started';

  @override
  String get onboardingContinue => 'Continue';

  @override
  String get loginCreateAccountHeading => 'Create your account';

  @override
  String get loginCreateAccountPrompt => 'Create an account';

  @override
  String get loginRestoreAccountHeading => 'Restore your account';

  @override
  String get loginWelcomeBack => 'Welcome back';

  @override
  String get loginEmailRequired => 'Enter your email address.';

  @override
  String get loginEmailInvalid => 'Enter a valid email address.';

  @override
  String get loginPasswordRequired => 'Enter your password.';

  @override
  String get loginPasswordMinimum => 'Use at least 12 characters.';

  @override
  String get loginPasswordHelper => 'At least 12 characters';

  @override
  String get loginShowPassword => 'Show password';

  @override
  String get loginHidePassword => 'Hide password';

  @override
  String get loginLegalLoading => 'Loading current legal documents…';

  @override
  String get loginAcceptTerms => 'I accept the Terms of Service';

  @override
  String loginReadTerms(String version) {
    return 'Read Terms ($version)';
  }

  @override
  String get loginAcknowledgePrivacy => 'I acknowledge the Privacy Notice';

  @override
  String loginReadPrivacy(String version) {
    return 'Read Privacy Notice ($version)';
  }

  @override
  String get loginRestoreAction => 'Restore account';

  @override
  String get loginForgotPassword => 'Forgot password?';

  @override
  String get loginAlreadyHaveAccount => 'I already have an account';

  @override
  String get loginBackToSignIn => 'Back to sign in';

  @override
  String get loginCancelDeletion => 'Cancel scheduled account deletion';

  @override
  String get loginLegalLoadFailed =>
      'Legal documents could not be loaded. Check your connection and try again.';

  @override
  String get loginLegalUnavailable =>
      'Legal documents could not be loaded. Try again.';

  @override
  String get loginAcceptLegal =>
      'Accept the Terms of Service and Privacy Notice to continue.';

  @override
  String get loginOpenLegalFailed => 'Could not open the legal document.';

  @override
  String get loginSessionPersistenceFailed =>
      'Your credentials were accepted, but this device could not save the secure session. Unlock your phone and try again.';

  @override
  String get loginMfaTitle => 'Verify it\'s you';

  @override
  String get loginMfaDetail =>
      'Enter the 6-digit code from your authenticator app, or one of your recovery codes.';

  @override
  String get loginMfaCode => 'Authenticator or recovery code';

  @override
  String get loginMfaFailed => 'Verification failed. Try signing in again.';

  @override
  String get loginResetTitle => 'Reset password';

  @override
  String get loginResetSend => 'Send reset code';

  @override
  String get loginResetCodeTitle => 'Enter your reset code';

  @override
  String get loginResetSent =>
      'If an account exists, a one-hour reset code has been sent.';

  @override
  String get loginResetCode => 'Reset code';

  @override
  String get loginNewPassword => 'New password (12+ characters)';

  @override
  String get loginLater => 'Later';

  @override
  String get loginSetNewPassword => 'Set new password';

  @override
  String get loginPasswordUpdated => 'Password updated. You can sign in now.';

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

  @override
  String bankPlanConnectionLimit(
      String planName, num limit, String institutions) {
    return 'Your $planName plan connects up to $limit $institutions. Upgrade to connect more.';
  }

  @override
  String get bankInstitution => 'institution';

  @override
  String get bankInstitutions => 'institutions';

  @override
  String get bankConnectAction => 'Connect bank';

  @override
  String get bankReconnectThisAction => 'reconnect this bank';

  @override
  String get bankConnectionNotCompleted => 'Bank connection was not completed.';

  @override
  String get bankStepUpTitle => 'Confirm it’s you';

  @override
  String bankStepUpDetail(String action) {
    return 'Enter your FINVERSE password to $action. Plaid handles your bank sign-in separately.';
  }

  @override
  String get bankPasswordLabel => 'FINVERSE password';

  @override
  String get bankContinueAction => 'Continue';

  @override
  String get bankTransactionsCurrent => 'Transactions are up to date.';

  @override
  String bankDisconnectTitle(String institution) {
    return 'Disconnect $institution?';
  }

  @override
  String get bankDisconnectDetail =>
      'Plaid access will be revoked immediately. Transactions already imported into FINVERSE are kept so your budgets and history remain useful.';

  @override
  String get bankDisconnectAction => 'Disconnect';

  @override
  String get bankAccessRevoked => 'Bank access revoked.';

  @override
  String get bankAddManualTitle => 'Add manual account';

  @override
  String get bankEditManualTitle => 'Edit manual account';

  @override
  String get bankAccountNameLabel => 'Account name';

  @override
  String get bankAccountTypeLabel => 'Account type';

  @override
  String get bankManualCash => 'Cash or wallet';

  @override
  String get bankManualChecking => 'Offline chequing';

  @override
  String get bankManualSavings => 'Offline savings';

  @override
  String get bankManualInvestment => 'Investment value';

  @override
  String get bankManualLoan => 'Loan or other debt';

  @override
  String get bankAmountOwedLabel => 'Amount owed';

  @override
  String get bankCurrentValueLabel => 'Current value';

  @override
  String get bankAmountHelper =>
      'Enter a positive amount; debts are stored as owed.';

  @override
  String get bankCurrencyLabel => 'Currency (for example CAD)';

  @override
  String get bankAddAccountAction => 'Add account';

  @override
  String get bankSaveChangesAction => 'Save changes';

  @override
  String get bankManualAccountInvalid =>
      'Enter a name, a three-letter currency, and a valid amount.';

  @override
  String get bankManualAccountAdded => 'Manual account added.';

  @override
  String get bankManualAccountUpdated => 'Manual account updated.';

  @override
  String bankRemoveManualTitle(String account) {
    return 'Remove $account?';
  }

  @override
  String get bankRemoveManualDetail =>
      'This removes the manual balance from FINVERSE. It does not affect any bank or financial institution.';

  @override
  String get bankRemoveAction => 'Remove';

  @override
  String get bankManualAccountRemoved => 'Manual account removed.';

  @override
  String get bankUnavailableInBuild =>
      'Bank connection is not available in this build. Add accounts manually here instead.';

  @override
  String get bankSetupIncomplete =>
      'Bank connection setup is incomplete on this server. Finish the Plaid app configuration and try again.';

  @override
  String get bankProviderUnavailable =>
      'The bank provider is temporarily unavailable. Try again shortly.';

  @override
  String get bankCredentialsMissing =>
      'This server has no Plaid credentials yet. Plaid Sandbox keys are free — see docs/11-run-on-your-phone.md.';

  @override
  String get bankAccountsTitle => 'Accounts';

  @override
  String get bankRefreshAction => 'Refresh';

  @override
  String get bankAddManualAction => 'Add manual';

  @override
  String get bankSecureTitle => 'Secure bank connection';

  @override
  String get bankSecureDetail =>
      'FINVERSE never sees or stores your bank password. Plaid handles sign-in and consent.';

  @override
  String get bankNetPositionSection => 'ACCOUNTS IN YOUR NET POSITION';

  @override
  String get bankNoBalancesTitle => 'No balances yet';

  @override
  String get bankNoBalancesDetail =>
      'Connect a bank or add cash, an offline investment, or a loan manually.';

  @override
  String get bankConnectionsSection => 'BANK CONNECTIONS';

  @override
  String get bankNoConnectionsTitle => 'No bank connected yet';

  @override
  String get bankNoConnectionsDetail =>
      'Connect a bank for automatic balances and transactions.';

  @override
  String get bankPlatformUnavailableTitle => 'Not available in this build';

  @override
  String get bankPlatformUnavailableDetail =>
      'Bank connection is not wired up for this platform yet. It works in the browser, Android, and iOS. You can still add your accounts and cards with \"Add manual\" and set budgets and goals against them.';

  @override
  String bankManualAccountSubtitle(String type, String currency) {
    return '$type · Manual · $currency';
  }

  @override
  String bankLinkedAccountSubtitle(String type, String mask) {
    return '$type · •••• $mask';
  }

  @override
  String get bankManualActionsTooltip => 'Manual account actions';

  @override
  String get bankEditBalanceAction => 'Edit balance';

  @override
  String get bankRemoveAccountAction => 'Remove account';

  @override
  String get bankTypeCreditCard => 'Credit card';

  @override
  String get bankTypeChecking => 'Chequing';

  @override
  String get bankTypeSavings => 'Savings';

  @override
  String get bankTypeInvestment => 'Investment';

  @override
  String get bankTypeLoan => 'Loan';

  @override
  String get bankTypeCash => 'Cash';

  @override
  String get bankReconnectAction => 'Reconnect';

  @override
  String get bankSyncNowTooltip => 'Sync now';

  @override
  String get bankAccessRevokedStatus => 'Access revoked - reconnect to resume';

  @override
  String get bankSignInNeedsAttention => 'Sign-in needs attention';

  @override
  String get bankSyncingStatus => 'Syncing…';

  @override
  String get bankSyncError => 'Sync error';

  @override
  String bankSyncErrorWithCode(String code) {
    return 'Sync error · $code';
  }

  @override
  String get bankConnectedStatus => 'Connected';

  @override
  String bankLastSynced(String date) {
    return 'Last synced $date';
  }

  @override
  String get transactionsTitle => 'Transactions';

  @override
  String get transactionsSearchHint => 'Search merchant or description';

  @override
  String get transactionsFilterAction => 'Filter transactions';

  @override
  String transactionsFiltersActive(num count) {
    return 'Filters ($count active)';
  }

  @override
  String get transactionsSearchAction => 'Search';

  @override
  String get transactionsRetryAction => 'Retry';

  @override
  String get transactionsNoMatches => 'No matching transactions.';

  @override
  String transactionsLoadOlderFailed(String detail) {
    return 'Could not load older transactions: $detail';
  }

  @override
  String get transactionsFilterTitle => 'Filter transactions';

  @override
  String get transactionsMoneyTypeLabel => 'Money type';

  @override
  String get transactionsAllTypes => 'All types';

  @override
  String get transactionsSpending => 'Spending';

  @override
  String get transactionsIncome => 'Income';

  @override
  String get transactionsTransfers => 'Transfers';

  @override
  String get transactionsCategoryLabel => 'Category';

  @override
  String get transactionsAllCategories => 'All categories';

  @override
  String get transactionsAccountLabel => 'Account';

  @override
  String get transactionsAllAccounts => 'All accounts';

  @override
  String get transactionsStatusLabel => 'Status';

  @override
  String get transactionsAll => 'All';

  @override
  String get transactionsPosted => 'Posted';

  @override
  String get transactionsPending => 'Pending';

  @override
  String get transactionsFrequencyLabel => 'Frequency';

  @override
  String get transactionsRecurring => 'Recurring';

  @override
  String get transactionsOneOff => 'One-off';

  @override
  String get transactionsMinAmountLabel => 'Min amount';

  @override
  String get transactionsMaxAmountLabel => 'Max amount';

  @override
  String get transactionsMinorUnits => 'Minor units';

  @override
  String transactionsFrom(String date) {
    return 'From: $date';
  }

  @override
  String transactionsTo(String date) {
    return 'To: $date';
  }

  @override
  String get transactionsChooseDate => 'Choose date';

  @override
  String get transactionsInvalidAmounts =>
      'Amounts must be whole minor-unit values.';

  @override
  String get transactionsAmountRangeInvalid =>
      'Minimum amount cannot exceed maximum.';

  @override
  String get transactionsDateRangeInvalid =>
      'The start date must be before the end date.';

  @override
  String get transactionsClearFilters => 'Clear all';

  @override
  String get transactionsApplyFilters => 'Apply filters';
}
