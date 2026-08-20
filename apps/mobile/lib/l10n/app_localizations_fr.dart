// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'FINVERSE';

  @override
  String get navHome => 'Accueil';

  @override
  String get navTransactions => 'Transactions';

  @override
  String get navAnalytics => 'Analyse';

  @override
  String get navAccounts => 'Comptes';

  @override
  String get navProfile => 'Profil';

  @override
  String get commonRetry => 'Réessayer';

  @override
  String get commonCancel => 'Annuler';

  @override
  String get commonSave => 'Enregistrer';

  @override
  String get commonSignOut => 'Se déconnecter';

  @override
  String get commonSearch => 'Rechercher';

  @override
  String get commonBack => 'Retour';

  @override
  String get signInTitle => 'Connexion à FINVERSE';

  @override
  String get signInAction => 'Se connecter';

  @override
  String get registerAction => 'Créer un compte';

  @override
  String get emailLabel => 'Courriel';

  @override
  String get passwordLabel => 'Mot de passe';

  @override
  String get offlineBannerTitle => 'Hors ligne — données enregistrées';

  @override
  String get offlineBannerPending => 'Modifications hors ligne en attente';

  @override
  String offlineBannerPendingDetail(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count modifications enregistrées sur cet appareil et synchronisées automatiquement à la reconnexion.',
      one:
          '1 modification enregistrée sur cet appareil et synchronisée automatiquement à la reconnexion.',
    );
    return '$_temp0';
  }

  @override
  String get offlineBannerRejected =>
      'Certaines modifications hors ligne ont ete refusees';

  @override
  String offlineBannerRejectedDetail(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count modifications n ont pas pu etre enregistrees et ne seront pas relancees automatiquement.',
      one:
          '1 modification n a pas pu etre enregistree et ne sera pas relancee automatiquement.',
    );
    return '$_temp0';
  }

  @override
  String get offlineBannerDismissRejected => 'Ignorer';

  @override
  String get offlineBannerReviewRejected => 'Examiner';

  @override
  String get offlineConflictTitle => 'Modifications hors ligne';

  @override
  String get offlineConflictEmpty =>
      'Aucune modification hors ligne n\'a ete refusee.';

  @override
  String get offlineConflictPendingTitle => 'En attente de synchronisation';

  @override
  String get offlineConflictRejectedTitle => 'A traiter';

  @override
  String get offlineConflictDismissOne => 'Ignorer';

  @override
  String get offlineConflictRetry => 'Reessayer';

  @override
  String offlineConflictStatus(int code) {
    return 'HTTP $code';
  }

  @override
  String offlineBannerLastUpdated(Object date) {
    return 'Dernière mise à jour : $date. Les changements sont en lecture seule jusqu\'à la reconnexion.';
  }

  @override
  String get settingsTitle => 'Paramètres';

  @override
  String get profileTitle => 'Profil';

  @override
  String get privacyTitle => 'Confidentialité';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get bankConnectionsTitle => 'Connexions bancaires';

  @override
  String get budgetsTitle => 'Budgets';

  @override
  String get goalsTitle => 'Objectifs';

  @override
  String get planTitle => 'Votre forfait';

  @override
  String get helpTitle => 'Aide et assistance';

  @override
  String get languageTitle => 'Langue';

  @override
  String get languageSystemDefault => 'Utiliser la langue de l’appareil';

  @override
  String get languageEnglish => 'Anglais';

  @override
  String get languageFrench => 'Français';

  @override
  String get languageBetaDetail =>
      'Certaines pages sont encore en cours de traduction.';

  @override
  String get verificationEmailSent => 'E-mail de vérification envoyé.';

  @override
  String get profileSettingsPrivacyTitle => 'Paramètres et confidentialité';

  @override
  String get profileSettingsPrivacyDetail =>
      'Sécurité, A2F, verrouillage de l’app, consentement, exportation et contrôles de compte';

  @override
  String get profilePlanningSection => 'Planification';

  @override
  String get profileBudgetDetail =>
      'Définissez des limites et suivez vos catégories';

  @override
  String get profileGoalsDetail =>
      'Créez des objectifs d’épargne et des contributions';

  @override
  String get profileCashFlowPlanningTitle => 'Planification de trésorerie';

  @override
  String get profileCashFlowPlanningDetail =>
      'Prévoyez les soldes et simulez des achats';

  @override
  String get profileFinancialCalendarTitle => 'Calendrier financier';

  @override
  String get profileFinancialCalendarDetail =>
      'Consultez les factures, revenus, objectifs et avertissements';

  @override
  String get profileInsightsSection => 'Analyses et alertes';

  @override
  String get profileAnalyticsDetail =>
      'Explorez les tendances, catégories et votre santé financière';

  @override
  String get profileSubscriptionsTitle => 'Abonnements';

  @override
  String get profileSubscriptionsDetail =>
      'Examinez les coûts récurrents et les hausses de prix';

  @override
  String get profileNotificationsDetail =>
      'Consultez les alertes et vos préférences de notification';

  @override
  String get profileCategorizationRulesTitle => 'Règles de catégorisation';

  @override
  String get profileCategorizationRulesDetail =>
      'Examinez ou supprimez les règles enregistrées';

  @override
  String get commonDelete => 'Supprimer';

  @override
  String get assistantTitle => 'Demander à FINVERSE';

  @override
  String get assistantHeading => 'Une vision claire de votre argent';

  @override
  String get assistantDescription =>
      'Posez des questions sur vos dépenses, votre épargne, vos commerçants ou vos prélèvements récurrents. Les réponses utilisent les données agrégées de la période sélectionnée et restent dans FINVERSE.';

  @override
  String get assistantQuestionLabel => 'Votre question';

  @override
  String get assistantQuestionHint => 'Où ai-je le plus dépensé ?';

  @override
  String get assistantAskTooltip => 'Demander';

  @override
  String get assistantPromptHeading => 'Essayez une de ces questions';

  @override
  String get assistantPromptSpending => 'Où ai-je le plus dépensé ?';

  @override
  String get assistantPromptSavings => 'Combien ai-je épargné ?';

  @override
  String get assistantPromptSubscriptions =>
      'Quels abonnements est-ce que je paie ?';

  @override
  String get assistantPromptHigherSpending =>
      'Est-ce que mes dépenses sont plus élevées que d’habitude ?';

  @override
  String get assistantQuestionRequired =>
      'Posez une question sur vos dépenses ou votre épargne.';

  @override
  String get assistantCouldNotAnswer => 'Impossible de répondre pour le moment';

  @override
  String get assistantAnswerTitle => 'Votre réponse';

  @override
  String get notificationsMarkAllRead => 'Tout marquer comme lu';

  @override
  String get notificationsPreferencesTooltip => 'Préférences des alertes';

  @override
  String get notificationsEmptyTitle => 'Vous êtes à jour';

  @override
  String get notificationsEmptyDetail =>
      'Les alertes de budget, facture, abonnement, dépense inhabituelle, solde, crédit et sécurité apparaîtront ici.';

  @override
  String notificationsMarkedRead(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count alertes marquées comme lues.',
      one: '1 alerte marquée comme lue.',
    );
    return '$_temp0';
  }

  @override
  String get notificationPreferencesTitle => 'Préférences des alertes';

  @override
  String get notificationPermissionDenied =>
      'Les notifications sont désactivées. Activez-les dans les réglages de votre appareil.';

  @override
  String get notificationBudgetProgress => 'Progression du budget';

  @override
  String get notificationBills => 'Factures et échéances';

  @override
  String get notificationCreditUtilization => 'Utilisation du crédit';

  @override
  String get notificationSubscriptionChanges => 'Modifications d’abonnements';

  @override
  String get notificationLowBalance => 'Solde faible';

  @override
  String get notificationUnusualTransactions => 'Transactions inhabituelles';

  @override
  String get notificationBankSync => 'Synchronisation bancaire';

  @override
  String get notificationSecurityEvents => 'Événements de sécurité';

  @override
  String get notificationDeviceUnavailable =>
      'Alertes de l’appareil indisponibles ici';

  @override
  String get notificationDeviceUnavailableDetail =>
      'Les alertes natives sont offertes dans les applications Android et iPhone.';

  @override
  String get notificationDeviceAlerts => 'Alertes de l’appareil';

  @override
  String get notificationDeviceAlertsEnabled =>
      'Les alertes FINVERSE non lues peuvent apparaître dans votre centre de notifications.';

  @override
  String get notificationDeviceAlertsDisabled =>
      'Autorisez les alertes locales pour les budgets, factures, banques et événements de sécurité non lus.';

  @override
  String get notificationTurnOff => 'Désactiver';

  @override
  String get notificationEnable => 'Activer';

  @override
  String get categorizationRulesDeleteTitle => 'Supprimer cette règle ?';

  @override
  String categorizationRulesDeleteDescription(String pattern, String category) {
    return 'Les futures transactions correspondantes utiliseront de nouveau le processus normal de catégorisation. Les choix existants restent inchangés.\n\n« $pattern » → $category';
  }

  @override
  String get categorizationRulesKeep => 'Conserver la règle';

  @override
  String get categorizationRulesDeleted => 'Règle supprimée.';

  @override
  String categorizationRulesDeleteFailed(String detail) {
    return 'Impossible de supprimer cette règle. $detail';
  }

  @override
  String get categorizationRulesEmptyTitle => 'Aucune règle enregistrée';

  @override
  String get categorizationRulesEmptyDetail =>
      'Lorsque vous corrigez la catégorie d’une transaction, FINVERSE peut mémoriser ce choix pour les commerçants correspondants.';

  @override
  String get categorizationRulesIntro =>
      'Ces règles s’appliquent à votre compte sur tous vos appareils. Les supprimer ne modifie pas le relevé bancaire original ni les modifications existantes.';

  @override
  String get categorizationRulesDeleteTooltip => 'Supprimer la règle';

  @override
  String get subscriptionsRefreshTooltip => 'Actualiser les abonnements';

  @override
  String get subscriptionsLoadError => 'Impossible de charger les abonnements';

  @override
  String subscriptionsRecurringCount(num count, String currency) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count paiements récurrents en $currency',
      one: '1 paiement récurrent en $currency',
    );
    return '$_temp0';
  }

  @override
  String get subscriptionsEstimatedMonthly => 'Estimation mensuelle';

  @override
  String get subscriptionsEstimatedYearly => 'Estimation annuelle';

  @override
  String get subscriptionsPriceChanges => 'CHANGEMENTS DE PRIX';

  @override
  String subscriptionsPriceIncrease(String merchant, num percent) {
    return '$merchant a augmenté de $percent%';
  }

  @override
  String subscriptionsAnnualImpact(String from, String to, String impact) {
    return 'de $from à $to · incidence annuelle de $impact';
  }

  @override
  String get subscriptionsDetected => 'DÉTECTÉS';

  @override
  String get subscriptionsEmptyTitle => 'Aucun abonnement récurrent détecté.';

  @override
  String get subscriptionsEmptyDetail =>
      'Connectez et synchronisez une banque ayant au moins quelques mois de transactions.';

  @override
  String subscriptionsNextExpected(String date) {
    return 'Prochain prélèvement prévu le $date';
  }

  @override
  String get subscriptionsPerYear => '/an';

  @override
  String get subscriptionsMayHaveEnded => 'PEUT ÊTRE TERMINÉ';

  @override
  String get subscriptionsDisclaimer =>
      'Les abonnements sont détectés à partir des habitudes de transaction. Confirmez les frais auprès du commerçant avant d’agir.';

  @override
  String get subscriptionsCadenceWeekly => 'Chaque semaine';

  @override
  String get subscriptionsCadenceBiweekly => 'Toutes les deux semaines';

  @override
  String get subscriptionsCadenceMonthly => 'Chaque mois';

  @override
  String get subscriptionsCadenceQuarterly => 'Chaque trimestre';

  @override
  String get subscriptionsCadenceAnnual => 'Chaque année';

  @override
  String get calendarRefreshTooltip => 'Actualiser le calendrier';

  @override
  String get calendarDisclaimer =>
      'Cette vue utilise uniquement les revenus répétitifs et les factures récurrentes. Les soldes réels peuvent différer si des dépenses quotidiennes ou une synchronisation bancaire manquent.';

  @override
  String get calendarNextNinetyDays => 'Les 90 prochains jours';

  @override
  String calendarExpectedEventCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count événements prévus',
      one: '1 événement prévu',
      zero: 'Aucun événement prévu',
    );
    return '$_temp0';
  }

  @override
  String calendarLowBalanceDateCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count dates de solde faible',
      one: '1 date de solde faible',
      zero: 'aucune date de solde faible',
    );
    return '$_temp0';
  }

  @override
  String get calendarStartingBalance => 'Solde de départ';

  @override
  String get calendarProjectedEnding => 'Solde prévu à la fin';

  @override
  String get calendarPreviousMonth => 'Mois précédent';

  @override
  String get calendarNextMonth => 'Mois suivant';

  @override
  String calendarOutsideForecast(String date) {
    return '$date hors de la prévision';
  }

  @override
  String calendarGoalTarget(String name) {
    return 'Objectif d’épargne, $name';
  }

  @override
  String get calendarNoExpectedEvents => 'Aucun événement prévu';

  @override
  String get calendarProjectedLowBalance => 'Solde faible prévu';

  @override
  String get calendarProjectedLowBalanceSemantics => 'solde faible prévu';

  @override
  String get calendarLowBalanceDetail =>
      'Examinez les factures ou prévoyez une marge avant cette date.';

  @override
  String get calendarSelectDate => 'Sélectionnez une date de prévision';

  @override
  String get calendarSelectDateDetail =>
      'Touchez une journée en surbrillance pour voir les événements prévus.';

  @override
  String get calendarExpectedIncome => 'Revenu prévu';

  @override
  String get calendarExpectedBill => 'Facture prévue';

  @override
  String calendarPatternConfidence(num percent) {
    return 'confiance de $percent% dans le modèle';
  }

  @override
  String calendarGoalProgress(String remaining) {
    return 'Objectif d’épargne · $remaining restant';
  }

  @override
  String calendarSuggestedMonthly(String amount) {
    return '$amount suggéré par mois';
  }

  @override
  String get calendarUnavailable => 'Calendrier indisponible';

  @override
  String get calendarUnavailableDetail =>
      'Vérifiez votre connexion et réessayez.';

  @override
  String get commonCreate => 'Créer';

  @override
  String get commonAdd => 'Ajouter';

  @override
  String get commonRemove => 'Supprimer';

  @override
  String get commonVerify => 'Vérifier';

  @override
  String get budgetCreateTitle => 'Créer un budget mensuel';

  @override
  String get budgetCategory => 'Catégorie';

  @override
  String get budgetMonthlyLimit => 'Limite mensuelle (dollars)';

  @override
  String get budgetPositiveAmount => 'Entrez un montant positif en dollars.';

  @override
  String budgetSaveFailed(String detail) {
    return 'Impossible d’enregistrer le budget. $detail';
  }

  @override
  String get budgetNew => 'Nouveau budget';

  @override
  String get budgetEmpty =>
      'Créez un budget pour commencer à suivre votre progression.';

  @override
  String get budgetRemoveTitle => 'Supprimer ce budget ?';

  @override
  String budgetStopTracking(String category) {
    return 'Arrêter de suivre $category ?';
  }

  @override
  String budgetRemoveFailed(String detail) {
    return 'Impossible de supprimer le budget. $detail';
  }

  @override
  String get goalCreateTitle => 'Créer un objectif d’épargne';

  @override
  String get goalName => 'Nom de l’objectif';

  @override
  String get goalTargetAmount => 'Montant cible';

  @override
  String get goalAlreadySaved => 'Déjà épargné';

  @override
  String get goalTargetDate => 'Date cible (AAAA-MM-JJ, facultative)';

  @override
  String get goalEnterValid => 'Entrez un nom et une cible positive valide.';

  @override
  String goalCreateFailed(String detail) {
    return 'Impossible de créer l’objectif. $detail';
  }

  @override
  String goalAddTo(String name) {
    return 'Ajouter à $name';
  }

  @override
  String get goalContributionAmount => 'Montant de la contribution';

  @override
  String get goalNew => 'Nouvel objectif';

  @override
  String get goalEmpty =>
      'Créez un objectif pour transformer votre épargne en plan.';

  @override
  String goalSavedOf(String saved, String target) {
    return '$saved épargné sur $target';
  }

  @override
  String goalRemaining(String amount) {
    return 'Il reste $amount';
  }

  @override
  String goalMonthlyTarget(String amount) {
    return '$amount/mois pour atteindre la date cible.';
  }

  @override
  String get goalCompleted => 'Terminé';

  @override
  String get goalAddSavings => 'Ajouter une épargne';

  @override
  String get planningPositiveAmount =>
      'Entrez un montant positif avec au plus deux décimales.';

  @override
  String get planningOpenCalendar => 'Ouvrir le calendrier financier';

  @override
  String get planningConservativeForecast => 'Prévision prudente';

  @override
  String get planningForecastDetail =>
      'Uniquement les revenus et factures répétitifs. Les dépenses quotidiennes ne sont pas prédites.';

  @override
  String get planningForecastBaseline =>
      'Base: les revenus et factures recurrents connus restent couverts sur cette periode. Ce n\'est pas une prediction des depenses quotidiennes.';

  @override
  String planningForecastRiskBand(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          'Zone de risque: $count jours passent sous zero si seuls les flux recurrents connus continuent. Les depenses quotidiennes ne sont pas predites.',
      one:
          'Zone de risque: 1 jour passe sous zero si seuls les flux recurrents connus continuent. Les depenses quotidiennes ne sont pas predites.',
    );
    return '$_temp0';
  }

  @override
  String get planningToday => 'Aujourd’hui';

  @override
  String get planningEnd => 'Fin';

  @override
  String planningForecastSemantics(String start, String end, String detail) {
    return 'Prévision de trésorerie de $start à $end. $detail';
  }

  @override
  String get planningNoNegativeBalance =>
      'Aucune date de solde négatif modélisée.';

  @override
  String planningNegativeBalanceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count dates de solde négatif modélisées.',
      one: '1 date de solde négatif modélisée.',
    );
    return '$_temp0';
  }

  @override
  String planningProjectedLowBalanceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count journées de solde faible prévues',
      one: '1 journée de solde faible prévue',
    );
    return '$_temp0';
  }

  @override
  String get planningAffordPurchase => 'Puis-je me permettre un achat ?';

  @override
  String planningPurchaseAmount(String currency) {
    return 'Montant de l’achat ($currency)';
  }

  @override
  String get planningPurchaseDate => 'Date d’achat';

  @override
  String get planningChecking => 'Vérification…';

  @override
  String get planningCheckScenario => 'Vérifier le scénario';

  @override
  String get planningAfterPurchase => 'Après l’achat';

  @override
  String get planningEndForecast => 'Fin de la prévision';

  @override
  String get planningExpectedEvents => 'Événements récurrents prévus';

  @override
  String get planningNoPattern =>
      'Aucune habitude récurrente solide n’a été trouvée.';

  @override
  String get analyticsRefreshTooltip => 'Actualiser les analyses';

  @override
  String get analyticsUnavailable => 'Analyses indisponibles';

  @override
  String get analyticsUnavailableDetail =>
      'Vérifiez votre connexion et réessayez. Rien n’a été perdu.';

  @override
  String get analyticsPeriodLabel => 'Période d’analyse';

  @override
  String get analyticsThisWeek => 'Cette semaine';

  @override
  String get analyticsThisMonth => 'Ce mois-ci';

  @override
  String get analyticsLastThreeMonths => 'Les 3 derniers mois';

  @override
  String get analyticsLastSixMonths => 'Les 6 derniers mois';

  @override
  String get analyticsLastYear => 'L’année dernière';

  @override
  String get analyticsAllHistory => 'Tout l’historique';

  @override
  String get analyticsCustomRange => 'Période personnalisée';

  @override
  String get analyticsChooseFirstDay => 'Choisissez le premier jour';

  @override
  String get analyticsChooseLastDay => 'Choisissez le dernier jour';

  @override
  String get analyticsHistoryEmptyTitle =>
      'Pas encore assez d’historique de transactions';

  @override
  String get analyticsHistoryEmptyDetail =>
      'Connectez une banque ou ajoutez des transactions pour voir les tendances.';

  @override
  String get analyticsExplainableInsights => 'Analyses explicables';

  @override
  String analyticsEvidenceCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count transactions',
      one: '1 transaction',
    );
    return 'Basé sur $_temp0';
  }

  @override
  String get analyticsTimeline => 'Chronologie financière';

  @override
  String get analyticsPlanAction =>
      'Planifier un achat ou voir votre prévision';

  @override
  String get analyticsIncome => 'Revenus';

  @override
  String get analyticsNetExpenses => 'Dépenses nettes';

  @override
  String get analyticsSavings => 'Épargne';

  @override
  String get analyticsSavingsRate => 'Taux d’épargne';

  @override
  String get analyticsPaceNoHistory =>
      'Continuez à utiliser FINVERSE pour établir une base historique utile.';

  @override
  String get analyticsPaceNoComparison =>
      'Il n’y a pas assez d’historique comparable pour comparer le rythme.';

  @override
  String analyticsPaceProjected(String percent, String direction) {
    return 'Les dépenses projetées sont $percent% $direction que votre rythme historique.';
  }

  @override
  String get analyticsPaceAbove => 'au-dessus';

  @override
  String get analyticsPaceBelow => 'en dessous';

  @override
  String analyticsPaceTitle(String amount) {
    return 'Rythme des dépenses : $amount';
  }

  @override
  String analyticsPaceCurrent(String amount) {
    return 'Actuel : $amount';
  }

  @override
  String get analyticsRefundsMatched => 'Remboursements associés';

  @override
  String get analyticsRefundsDetail =>
      'Ces remboursements ont été reliés à des achats antérieurs à l’aide du commerçant et du montant.';

  @override
  String analyticsRefundRow(String amount, num days) {
    return '$amount remboursé · $days jours après l’achat';
  }

  @override
  String analyticsRecurringCharges(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count frais récurrents',
      one: '1 frais récurrent',
    );
    return '$_temp0';
  }

  @override
  String analyticsSubscriptionTotals(String monthly, String yearly) {
    return '$monthly/mois · $yearly/an';
  }

  @override
  String analyticsPriceRiseCount(num count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count hausses de prix',
      one: '1 hausse de prix',
    );
    return '$_temp0';
  }

  @override
  String get analyticsPriorityCritical => 'Critique';

  @override
  String get analyticsPriorityImportant => 'Important';

  @override
  String get analyticsPriorityInfo => 'Info';

  @override
  String get onboardingSkip => 'Passer';

  @override
  String get onboardingMoneyTitle => 'Voyez clairement votre argent';

  @override
  String get onboardingMoneyDetail =>
      'Regroupez vos comptes et transactions dans une vue privée, puis comprenez où va chaque dollar.';

  @override
  String get onboardingProgressTitle => 'Transformez vos projets en progrès';

  @override
  String get onboardingProgressDetail =>
      'Fixez des budgets et des objectifs d’épargne, surveillez vos abonnements et recevez des alertes utiles avant que les petits problèmes ne grandissent.';

  @override
  String get onboardingPrivacyTitle =>
      'Connectez-vous sans partager vos identifiants';

  @override
  String get onboardingPrivacyDetail =>
      'Plaid gère la connexion bancaire. FINVERSE ne reçoit jamais votre mot de passe bancaire et chiffre les jetons d’accès du fournisseur.';

  @override
  String get onboardingGetStarted => 'Commencer';

  @override
  String get onboardingContinue => 'Continuer';

  @override
  String get loginCreateAccountHeading => 'Créez votre compte';

  @override
  String get loginCreateAccountPrompt => 'Créer un compte';

  @override
  String get loginRestoreAccountHeading => 'Restaurez votre compte';

  @override
  String get loginWelcomeBack => 'Bon retour';

  @override
  String get loginEmailRequired => 'Entrez votre adresse courriel.';

  @override
  String get loginEmailInvalid => 'Entrez une adresse courriel valide.';

  @override
  String get loginPasswordRequired => 'Entrez votre mot de passe.';

  @override
  String get loginPasswordMinimum => 'Utilisez au moins 12 caractères.';

  @override
  String get loginPasswordHelper => 'Au moins 12 caractères';

  @override
  String get loginShowPassword => 'Afficher le mot de passe';

  @override
  String get loginHidePassword => 'Masquer le mot de passe';

  @override
  String get loginLegalLoading =>
      'Chargement des documents juridiques actuels…';

  @override
  String get loginAcceptTerms => 'J’accepte les conditions d’utilisation';

  @override
  String loginReadTerms(String version) {
    return 'Lire les conditions ($version)';
  }

  @override
  String get loginAcknowledgePrivacy =>
      'Je reconnais l’avis de confidentialité';

  @override
  String loginReadPrivacy(String version) {
    return 'Lire l’avis de confidentialité ($version)';
  }

  @override
  String get loginRestoreAction => 'Restaurer le compte';

  @override
  String get loginForgotPassword => 'Mot de passe oublié ?';

  @override
  String get loginAlreadyHaveAccount => 'J’ai déjà un compte';

  @override
  String get loginBackToSignIn => 'Retour à la connexion';

  @override
  String get loginCancelDeletion => 'Annuler la suppression prévue du compte';

  @override
  String get loginLegalLoadFailed =>
      'Les documents juridiques n’ont pas pu être chargés. Vérifiez votre connexion et réessayez.';

  @override
  String get loginLegalUnavailable =>
      'Les documents juridiques n’ont pas pu être chargés. Réessayez.';

  @override
  String get loginAcceptLegal =>
      'Acceptez les conditions d’utilisation et l’avis de confidentialité pour continuer.';

  @override
  String get loginOpenLegalFailed =>
      'Impossible d’ouvrir le document juridique.';

  @override
  String get loginSessionPersistenceFailed =>
      'Vos identifiants ont été acceptés, mais cet appareil n’a pas pu enregistrer la session sécurisée. Déverrouillez votre téléphone et réessayez.';

  @override
  String get loginMfaTitle => 'Vérifions votre identité';

  @override
  String get loginMfaDetail =>
      'Entrez le code à 6 chiffres de votre application d’authentification ou l’un de vos codes de récupération.';

  @override
  String get loginMfaCode => 'Code d’authentification ou de récupération';

  @override
  String get loginMfaFailed =>
      'La vérification a échoué. Essayez de vous reconnecter.';

  @override
  String get loginResetTitle => 'Réinitialiser le mot de passe';

  @override
  String get loginResetSend => 'Envoyer le code de réinitialisation';

  @override
  String get loginResetCodeTitle => 'Entrez votre code de réinitialisation';

  @override
  String get loginResetSent =>
      'Si un compte existe, un code de réinitialisation valable une heure a été envoyé.';

  @override
  String get loginResetCode => 'Code de réinitialisation';

  @override
  String get loginNewPassword => 'Nouveau mot de passe (12 caractères ou plus)';

  @override
  String get loginLater => 'Plus tard';

  @override
  String get loginSetNewPassword => 'Définir le nouveau mot de passe';

  @override
  String get loginPasswordUpdated =>
      'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.';

  @override
  String get errorConnection =>
      'Impossible de joindre le serveur. Vérifiez votre connexion.';

  @override
  String get errorServerUnavailable =>
      'Le serveur est temporairement indisponible. Réessayez bientôt.';

  @override
  String get errorSessionInvalid =>
      'Votre session n\'est plus valide. Connectez-vous à nouveau.';

  @override
  String get errorServerSide =>
      'Une erreur est survenue de notre côté. Réessayez bientôt.';

  @override
  String get errorTimeout =>
      'Le serveur n\'a pas répondu. Vérifiez votre connexion et réessayez.';

  @override
  String categoryExplanationLearned(num percent) {
    return 'Appris d’un marchand similaire que vous avez déjà catégorisé • confiance de $percent%.';
  }

  @override
  String get receiptScanPhoto => 'Numériser une photo du reçu';

  @override
  String get receiptScanPhotoDetail =>
      'Texte reconnu sur ce téléphone — l’image n’est jamais téléchargée';

  @override
  String get receiptPasteText => 'Coller le texte du reçu';

  @override
  String get receiptPasteTextDetail =>
      'Utilisez le texte copié d’un reçu ou de l’OCR de votre téléphone';

  @override
  String get receiptTakePhoto => 'Prendre une photo';

  @override
  String get receiptChoosePhoto => 'Choisir dans vos photos';

  @override
  String get receiptReviewScanned => 'Vérifier le texte numérisé du reçu';

  @override
  String get receiptPasteExplanation =>
      'Collez le texte du reçu. FINVERSE extrait le marchand, la date, le total et les taxes. Les images ne sont jamais téléchargées.';

  @override
  String get receiptReviewExplanation =>
      'Vérifiez le texte reconnu avant de le joindre. Seul ce texte est envoyé à FINVERSE — jamais la photo.';

  @override
  String get receiptAttachAction => 'Joindre';

  @override
  String bankPlanConnectionLimit(
      String planName, num limit, String institutions) {
    return 'Votre forfait $planName permet de connecter jusqu\'à $limit $institutions. Passez au forfait supérieur pour en connecter davantage.';
  }

  @override
  String get bankInstitution => 'institution';

  @override
  String get bankInstitutions => 'institutions';

  @override
  String get bankConnectAction => 'Connecter une banque';

  @override
  String get bankReconnectThisAction => 'reconnecter cette banque';

  @override
  String get bankConnectionNotCompleted =>
      'La connexion bancaire n\'a pas été terminée.';

  @override
  String get bankStepUpTitle => 'Confirmons votre identité';

  @override
  String bankStepUpDetail(String action) {
    return 'Entrez votre mot de passe FINVERSE pour $action. Plaid gère séparément la connexion à votre banque.';
  }

  @override
  String get bankPasswordLabel => 'Mot de passe FINVERSE';

  @override
  String get bankContinueAction => 'Continuer';

  @override
  String get bankTransactionsCurrent => 'Les transactions sont à jour.';

  @override
  String bankDisconnectTitle(String institution) {
    return 'Déconnecter $institution ?';
  }

  @override
  String get bankDisconnectDetail =>
      'L\'accès de Plaid sera révoqué immédiatement. Les transactions déjà importées dans FINVERSE sont conservées afin que vos budgets et votre historique restent utiles.';

  @override
  String get bankDisconnectAction => 'Déconnecter';

  @override
  String get bankAccessRevoked => 'Accès bancaire révoqué.';

  @override
  String get bankAddManualTitle => 'Ajouter un compte manuel';

  @override
  String get bankEditManualTitle => 'Modifier le compte manuel';

  @override
  String get bankAccountNameLabel => 'Nom du compte';

  @override
  String get bankAccountTypeLabel => 'Type de compte';

  @override
  String get bankManualCash => 'Espèces ou portefeuille';

  @override
  String get bankManualChecking => 'Compte courant hors ligne';

  @override
  String get bankManualSavings => 'Épargne hors ligne';

  @override
  String get bankManualInvestment => 'Valeur des placements';

  @override
  String get bankManualProperty => 'Valeur immobilière';

  @override
  String get bankManualLoan => 'Prêt ou autre dette';

  @override
  String get bankAmountOwedLabel => 'Montant dû';

  @override
  String get bankCurrentValueLabel => 'Valeur actuelle';

  @override
  String get bankAmountHelper =>
      'Entrez un montant positif; les dettes sont enregistrées comme montants dus.';

  @override
  String get bankCurrencyLabel => 'Devise (par exemple CAD)';

  @override
  String get bankAddAccountAction => 'Ajouter le compte';

  @override
  String get bankSaveChangesAction => 'Enregistrer les modifications';

  @override
  String get bankManualAccountInvalid =>
      'Entrez un nom, une devise à trois lettres et un montant valide.';

  @override
  String get bankManualAccountAdded => 'Compte manuel ajouté.';

  @override
  String get bankManualAccountUpdated => 'Compte manuel mis à jour.';

  @override
  String bankRemoveManualTitle(String account) {
    return 'Supprimer $account ?';
  }

  @override
  String get bankRemoveManualDetail =>
      'Cette opération retire le solde manuel de FINVERSE. Elle n\'affecte aucune banque ni institution financière.';

  @override
  String get bankRemoveAction => 'Supprimer';

  @override
  String get bankManualAccountRemoved => 'Compte manuel supprimé.';

  @override
  String get bankUnavailableInBuild =>
      'La connexion bancaire n\'est pas offerte dans cette version. Ajoutez plutôt vos comptes manuellement ici.';

  @override
  String get bankSetupIncomplete =>
      'La configuration de la connexion bancaire est incomplète sur ce serveur. Terminez la configuration de l\'application Plaid et réessayez.';

  @override
  String get bankProviderUnavailable =>
      'Le fournisseur bancaire est temporairement indisponible. Réessayez bientôt.';

  @override
  String get bankCredentialsMissing =>
      'Ce serveur n\'a pas encore d\'identifiants Plaid. Les clés Sandbox de Plaid sont gratuites — consultez docs/11-run-on-your-phone.md.';

  @override
  String get bankAccountsTitle => 'Comptes';

  @override
  String get bankRefreshAction => 'Actualiser';

  @override
  String get bankAddManualAction => 'Ajouter manuellement';

  @override
  String get bankSecureTitle => 'Connexion bancaire sécurisée';

  @override
  String get bankSecureDetail =>
      'FINVERSE ne voit ni ne stocke jamais votre mot de passe bancaire. Plaid gère la connexion et le consentement.';

  @override
  String get bankNetPositionSection => 'COMPTES DANS VOTRE POSITION NETTE';

  @override
  String get bankNoBalancesTitle => 'Aucun solde pour le moment';

  @override
  String get bankNoBalancesDetail =>
      'Connectez une banque ou ajoutez manuellement des espèces, un placement hors ligne ou un prêt.';

  @override
  String get bankConnectionsSection => 'CONNEXIONS BANCAIRES';

  @override
  String get bankNoConnectionsTitle => 'Aucune banque connectée';

  @override
  String get bankNoConnectionsDetail =>
      'Connectez une banque pour obtenir automatiquement vos soldes et transactions.';

  @override
  String get bankPlatformUnavailableTitle =>
      'Non disponible dans cette version';

  @override
  String get bankPlatformUnavailableDetail =>
      'La connexion bancaire n\'est pas encore reliée à cette plateforme. Elle fonctionne dans le navigateur, sur Android et sur iOS. Vous pouvez quand même ajouter vos comptes et cartes avec « Ajouter manuellement », puis créer des budgets et objectifs pour ceux-ci.';

  @override
  String bankManualAccountSubtitle(String type, String currency) {
    return '$type · Manuel · $currency';
  }

  @override
  String bankLinkedAccountSubtitle(String type, String mask) {
    return '$type · •••• $mask';
  }

  @override
  String get bankManualActionsTooltip => 'Actions du compte manuel';

  @override
  String get bankEditBalanceAction => 'Modifier le solde';

  @override
  String get bankRemoveAccountAction => 'Supprimer le compte';

  @override
  String get bankTypeCreditCard => 'Carte de crédit';

  @override
  String get bankTypeChecking => 'Compte courant';

  @override
  String get bankTypeSavings => 'Épargne';

  @override
  String get bankTypeInvestment => 'Placement';

  @override
  String get bankTypeProperty => 'Propriété';

  @override
  String get bankTypeLoan => 'Prêt';

  @override
  String get bankTypeCash => 'Espèces';

  @override
  String get bankReconnectAction => 'Reconnecter';

  @override
  String get bankSyncNowTooltip => 'Synchroniser maintenant';

  @override
  String get bankAccessRevokedStatus =>
      'Accès révoqué - reconnectez-vous pour reprendre';

  @override
  String get bankSignInNeedsAttention => 'La connexion exige votre attention';

  @override
  String get bankSyncingStatus => 'Synchronisation…';

  @override
  String get bankSyncError => 'Erreur de synchronisation';

  @override
  String bankSyncErrorWithCode(String code) {
    return 'Erreur de synchronisation · $code';
  }

  @override
  String get bankConnectedStatus => 'Connecté';

  @override
  String bankLastSynced(String date) {
    return 'Dernière synchronisation : $date';
  }

  @override
  String get transactionsTitle => 'Transactions';

  @override
  String get transactionsSearchHint =>
      'Essayez « café de plus de 20 \$ le mois dernier »';

  @override
  String get transactionsFilterAction => 'Filtrer les transactions';

  @override
  String transactionsFiltersActive(num count) {
    return 'Filtres ($count actifs)';
  }

  @override
  String get transactionsSearchAction => 'Rechercher';

  @override
  String get transactionsRetryAction => 'Réessayer';

  @override
  String get transactionsNoMatches => 'Aucune transaction correspondante.';

  @override
  String transactionsLoadOlderFailed(String detail) {
    return 'Impossible de charger les transactions plus anciennes : $detail';
  }

  @override
  String get transactionsFilterTitle => 'Filtrer les transactions';

  @override
  String get transactionsMoneyTypeLabel => 'Type de mouvement';

  @override
  String get transactionsAllTypes => 'Tous les types';

  @override
  String get transactionsSpending => 'Dépenses';

  @override
  String get transactionsIncome => 'Revenus';

  @override
  String get transactionsTransfers => 'Virements';

  @override
  String get transactionsCategoryLabel => 'Catégorie';

  @override
  String get transactionsAllCategories => 'Toutes les catégories';

  @override
  String get transactionsAccountLabel => 'Compte';

  @override
  String get transactionsAllAccounts => 'Tous les comptes';

  @override
  String get transactionsStatusLabel => 'État';

  @override
  String get transactionsAll => 'Tous';

  @override
  String get transactionsPosted => 'Comptabilisée';

  @override
  String get transactionsPending => 'En attente';

  @override
  String get transactionsFrequencyLabel => 'Fréquence';

  @override
  String get transactionsRecurring => 'Récurrente';

  @override
  String get transactionsOneOff => 'Ponctuelle';

  @override
  String get transactionsMinAmountLabel => 'Montant min.';

  @override
  String get transactionsMaxAmountLabel => 'Montant max.';

  @override
  String get transactionsMinorUnits => 'Unités mineures';

  @override
  String transactionsFrom(String date) {
    return 'Du : $date';
  }

  @override
  String transactionsTo(String date) {
    return 'Au : $date';
  }

  @override
  String get transactionsChooseDate => 'Choisir une date';

  @override
  String get transactionsInvalidAmounts =>
      'Les montants doivent être des unités mineures entières.';

  @override
  String get transactionsAmountRangeInvalid =>
      'Le montant minimal ne peut pas dépasser le montant maximal.';

  @override
  String get transactionsDateRangeInvalid =>
      'La date de début doit précéder la date de fin.';

  @override
  String get transactionsClearFilters => 'Tout effacer';

  @override
  String get transactionsApplyFilters => 'Appliquer les filtres';

  @override
  String get helpDiagnosticsTitle => 'Diagnostics d’assistance FINVERSE';

  @override
  String helpDiagnosticsApiOrigin(String origin) {
    return 'Origine de l’API : $origin';
  }

  @override
  String helpDiagnosticsResult(String result) {
    return 'Résultat : $result';
  }

  @override
  String get helpDiagnosticsNotChecked => 'Non vérifié';

  @override
  String helpDiagnosticsHttpStatus(num status) {
    return 'État HTTP : $status';
  }

  @override
  String helpDiagnosticsChecked(String date) {
    return 'Vérifié : $date';
  }

  @override
  String get helpDiagnosticsCopied =>
      'Diagnostics copiés dans le presse-papiers.';

  @override
  String get helpSupportNotConfigured =>
      'Le contact d’assistance n’est pas configuré dans cette version.';

  @override
  String get helpNoEmailApp =>
      'Aucune application de courriel n’est disponible sur cet appareil.';

  @override
  String get helpEmailSubject => 'Demande d’assistance FINVERSE';

  @override
  String get helpHeading => 'Reprenez rapidement le contrôle';

  @override
  String get helpPrivacyDetail =>
      'FINVERSE conserve vos identifiants bancaires chez le fournisseur. Ces vérifications n’incluent jamais votre mot de passe, jeton d’accès ni données de transaction.';

  @override
  String get helpQuestionsSection => 'QUESTIONS COURANTES';

  @override
  String get helpIphoneQuestion => 'Mon iPhone ne peut pas se connecter';

  @override
  String get helpIphoneAnswer =>
      'Une version de production doit pointer vers l’origine HTTPS publique de l’API. Si elle a été compilée avec une adresse locale, recompilez-la avec la valeur API_BASE_URL fournie par le déploiement. Tailscale n’est pas nécessaire pour un déploiement public.';

  @override
  String get helpBankQuestion => 'Ma banque exige mon attention';

  @override
  String get helpBankAnswer =>
      'Ouvrez Réglages → Connexions bancaires et choisissez Reconnecter. Vous confirmerez d’abord votre mot de passe FINVERSE, puis Plaid vous demandera de vous reconnecter à l’institution. Les transactions existantes restent dans votre historique.';

  @override
  String get helpSessionQuestion =>
      'J’ai quitté l’application et elle m’a demandé de me reconnecter';

  @override
  String get helpSessionAnswer =>
      'FINVERSE conserve les identifiants de session tournants dans le trousseau du téléphone. Déverrouillez le téléphone une fois après un redémarrage, puis utilisez Réessayer. Une session révoquée ou expirée exige une nouvelle connexion pour votre protection.';

  @override
  String get helpOfflineQuestion => 'Qu’est-ce qui fonctionne hors ligne ?';

  @override
  String get helpOfflineAnswer =>
      'Les lectures authentifiées récentes peuvent être affichées depuis le cache chiffré de l’appareil. Les modifications de préférences de transaction sont mises en file d’attente puis rejouées plus tard. Les soldes, la synchronisation bancaire et les autres changements dont le serveur est responsable attendent une connexion.';

  @override
  String get helpDeleteQuestion => 'Comment supprimer mon compte ?';

  @override
  String get helpDeleteAnswer =>
      'Ouvrez Réglages → Supprimer le compte. FINVERSE révoque les sessions immédiatement et programme un effacement définitif après la période de récupération décrite dans l’avis de confidentialité.';

  @override
  String get helpCopyDiagnostics => 'Copier les diagnostics';

  @override
  String get helpContactSupport => 'Contacter l’assistance';

  @override
  String get helpConnectionNotChecked => 'Connexion non vérifiée';

  @override
  String get helpCheckConnection => 'Vérifier la connexion';

  @override
  String get planEntitlementMultipleInstitutions =>
      'Connecter plusieurs institutions';

  @override
  String get planEntitlementMonthlyPdf => 'Rapport PDF mensuel';

  @override
  String get planEntitlementCashFlow =>
      'Prévision de trésorerie et planification d’achats';

  @override
  String get planEntitlementDataExport => 'Exportation complète des données';

  @override
  String get planCheckoutPending =>
      'Terminez dans votre navigateur. Votre forfait sera mis à jour ici lorsque le paiement sera confirmé.';

  @override
  String planCouldNotOpen(String destination) {
    return 'Impossible d’ouvrir $destination.';
  }

  @override
  String get planCheckout => 'le paiement';

  @override
  String get planBillingPortal => 'le portail de facturation';

  @override
  String get planBillingNotConfigured =>
      'La facturation n’est pas encore configurée sur ce serveur.';

  @override
  String get planRefreshAction => 'Actualiser';

  @override
  String get planLoadFailed => 'Impossible de charger votre forfait';

  @override
  String get planTryAgain => 'Réessayer';

  @override
  String get planEverythingAvailable => 'Tout est disponible';

  @override
  String planNoLimits(num limit) {
    return 'Ce serveur ne limite pas les fonctions par forfait. Vous pouvez connecter jusqu’à $limit institutions et utiliser toutes les fonctions.';
  }

  @override
  String get planIncludesSection => 'CE QUE COMPREND CHAQUE FORFAIT';

  @override
  String get planPaidUnavailable =>
      'Les forfaits payants ne sont pas disponibles sur ce serveur.';

  @override
  String get planYearly => 'Annuel';

  @override
  String get planMonthly => 'Mensuel';

  @override
  String get planCurrentSection => 'FORFAIT ACTUEL';

  @override
  String get planManageSubscription => 'Gérer l’abonnement';

  @override
  String get planPaymentProblem => 'Problème de paiement';

  @override
  String get planPaymentProblemDetail =>
      'Nous n’avons pas pu prélever votre dernier paiement. Votre forfait demeure actif pendant nos nouvelles tentatives — mettez votre carte à jour pour le conserver.';

  @override
  String planFreeLimit(num limit, String institutions) {
    return 'Connectez jusqu’à $limit $institutions.';
  }

  @override
  String planEnds(String date) {
    return 'Se termine le $date. Vous conservez tout jusque-là.';
  }

  @override
  String planTrialEnds(String date) {
    return 'L’essai se termine le $date.';
  }

  @override
  String planRenews(String date) {
    return 'Se renouvelle le $date.';
  }

  @override
  String get planActive => 'Actif.';

  @override
  String get planCurrentChip => 'Actuel';

  @override
  String planConnectedInstitutions(num count, String institutions) {
    return '$count institutions connectées';
  }

  @override
  String planStartTrial(num days) {
    return 'Commencer l’essai gratuit de $days jours';
  }

  @override
  String planUpgradeTo(String plan) {
    return 'Passer à $plan';
  }

  @override
  String planTrialTerms(String interval) {
    return 'Puis facturé $interval. Annulez en tout temps avant la fin.';
  }

  @override
  String get planPaidFeature => 'Inclus dans un forfait payant';

  @override
  String get planNotNow => 'Pas maintenant';

  @override
  String get planSeePlans => 'Voir les forfaits';

  @override
  String get planWebPurchaseUnavailable =>
      'Les abonnements sont gérés sur le web. Connectez-vous à votre page de compte FINVERSE pour passer au niveau supérieur.';

  @override
  String get planNativePurchaseUnavailable =>
      'Les achats intégrés ne sont pas encore disponibles dans cette version.';

  @override
  String get transactionTileChangeCategory => 'Modifier la catégorie';

  @override
  String get transactionTilePending => 'en attente';

  @override
  String get transactionTileReview => 'à vérifier';

  @override
  String get transactionTileExcluded => 'exclue';

  @override
  String get transactionCategoryGroceries => 'épicerie';

  @override
  String get transactionCategoryRestaurants => 'restaurants';

  @override
  String get transactionCategoryCoffee => 'café';

  @override
  String get transactionCategoryFoodDelivery => 'livraison de repas';

  @override
  String get transactionCategoryFuel => 'carburant';

  @override
  String get transactionCategoryRideshare => 'transport avec chauffeur';

  @override
  String get transactionCategoryShopping => 'achats';

  @override
  String get transactionCategoryRent => 'loyer';

  @override
  String get transactionCategoryUtilities => 'services publics';

  @override
  String get transactionCategoryStreaming => 'diffusion en continu';

  @override
  String get transactionCategoryFitness => 'conditionnement physique';

  @override
  String get transactionCategoryHealthcare => 'soins de santé';

  @override
  String get dashboardNetCashFlow => 'Flux de trésorerie net';

  @override
  String get dashboardComparedWithPeriod => 'Comparé à la période précédente';

  @override
  String get dashboardRecentTransactions => 'Transactions récentes';

  @override
  String get dashboardFinancialHealth => 'Santé financière';

  @override
  String get dashboardInsights => 'Points importants';

  @override
  String get netWorthHistoryTitle => 'Historique de la position nette';

  @override
  String get netWorthHistorySubtitle =>
      'Soldes observés après les mises à jour — sans taux de change estimé';

  @override
  String get netWorthHistoryCurrent => 'Actuelle';

  @override
  String netWorthHistorySemantics(
      int count, String start, String end, String current) {
    return 'Historique de la position nette avec $count observations du $start au $end. Position actuelle : $current.';
  }

  @override
  String get dashboardSignOutTitle => 'Se déconnecter ?';

  @override
  String get dashboardSignOutDetail =>
      'Vous aurez besoin de votre courriel et de votre mot de passe pour vous reconnecter.';

  @override
  String get dashboardDeleteTitle => 'Supprimer votre compte ?';

  @override
  String get dashboardDeleteDetail =>
      'L\'accès prend fin immédiatement. Vous disposez de 30 jours pour restaurer le compte ; après cela, votre profil et vos données financières sont effacés définitivement.';

  @override
  String get dashboardDeletePasswordLabel => 'Mot de passe actuel';

  @override
  String get dashboardDeleteConfirmLabel => 'Tapez DELETE pour confirmer';

  @override
  String get dashboardDeleteKeepAction => 'Conserver le compte';

  @override
  String get dashboardDeleteScheduleAction => 'Planifier la suppression';

  @override
  String get dashboardDeleteInvalid =>
      'Saisissez votre mot de passe et tapez exactement DELETE.';

  @override
  String get dashboardVerifyEmailTitle => 'Vérifier votre courriel';

  @override
  String get dashboardVerifyEmailDetail =>
      'Saisissez le code de vérification valide 24 heures envoyé à votre courriel.';

  @override
  String get dashboardVerifyCodeLabel => 'Code de vérification';

  @override
  String get dashboardVerifyLaterAction => 'Plus tard';

  @override
  String get dashboardVerifyEmailVerified => 'Courriel vérifié.';

  @override
  String dashboardVerifySendFailed(String detail) {
    return 'Impossible d\'envoyer la vérification : $detail';
  }

  @override
  String get dashboardSyncTooltip => 'Synchroniser les comptes';

  @override
  String get dashboardAccountMenuTooltip => 'Menu du compte';

  @override
  String get dashboardVerifyEmailMenu => 'Vérifier le courriel';

  @override
  String get dashboardDeleteAccountMenu => 'Supprimer le compte';

  @override
  String get appLockLockedTitle => 'FINVERSE est verrouillé';

  @override
  String get appLockLockedDetail =>
      'Utilisez le code de votre appareil, votre empreinte ou votre visage pour afficher vos informations financières.';

  @override
  String get appLockWaitingForDevice => 'En attente de l\'appareil…';

  @override
  String get appLockUnlockAction => 'Déverrouiller FINVERSE';

  @override
  String get appLockSignOutInstead => 'Se déconnecter plutôt';

  @override
  String get secureStorageWaitTitle => 'FINVERSE attend le stockage sécurisé';

  @override
  String get secureStorageWaitDetail =>
      'Déverrouillez votre téléphone, puis réessayez. Votre session enregistrée n\'a pas été supprimée.';

  @override
  String get secureStorageTryAgain => 'Réessayer';

  @override
  String get analyticsTimelineKindIncome => 'Revenu';

  @override
  String get analyticsTimelineKindRefund => 'Remboursement';

  @override
  String get analyticsTimelineKindTransfer => 'Transfert';

  @override
  String get analyticsTimelineKindSubscription => 'Abonnement';

  @override
  String get analyticsTimelineKindBill => 'Facture';

  @override
  String get analyticsTimelineKindUnusual => 'Inhabituel';

  @override
  String get analyticsTimelineKindSpending => 'Dépense';

  @override
  String get splitTitle => 'Dépenses partagées';

  @override
  String get splitNewGroupTitle => 'Nouveau groupe';

  @override
  String get splitNewGroupAction => 'Nouveau groupe';

  @override
  String get splitGroupNameLabel => 'Nom du groupe';

  @override
  String get splitEmptyTitle => 'Aucun groupe partagé';

  @override
  String get splitEmptyDetail =>
      'Créez un groupe pour partager les factures et suivre qui doit quoi à qui.';

  @override
  String get splitAddMemberTitle => 'Ajouter un membre';

  @override
  String get splitAddMemberAction => 'Ajouter';

  @override
  String get splitMembersHeading => 'Membres';

  @override
  String get splitBalancesHeading => 'Soldes';

  @override
  String get splitSettleUpHeading => 'Régler les comptes';

  @override
  String get splitSettleUpTitle => 'Enregistrer un règlement';

  @override
  String get splitRecordSettlementAction => 'Réglé';

  @override
  String get splitExpensesHeading => 'Dépenses';

  @override
  String get splitAddExpenseAction => 'Ajouter';

  @override
  String get splitAddExpenseTitle => 'Ajouter une dépense';

  @override
  String get splitDescriptionLabel => 'Description';

  @override
  String get splitAmountLabel => 'Montant';

  @override
  String get splitCurrencyLabel => 'Devise (code ISO)';

  @override
  String get splitPaidByLabel => 'Payé par';

  @override
  String get splitSplitMethodLabel => 'Répartition';

  @override
  String get splitEqualOption => 'Parts égales';

  @override
  String get splitCustomOption => 'Parts personnalisées';

  @override
  String splitShareFor(Object name) {
    return 'Part de $name';
  }

  @override
  String get splitSharesMustMatch =>
      'Les parts doivent égaler le montant total.';

  @override
  String get splitArchiveAction => 'Archiver le groupe';

  @override
  String get splitArchiveConfirm =>
      'Archiver ce groupe ? Il deviendra en lecture seule.';

  @override
  String get splitArchived => 'Archivé';

  @override
  String get splitSettleAnyAction => 'Enregistrer un paiement';

  @override
  String get splitSettlementToLabel => 'Paiement à';

  @override
  String get splitNoteLabel => 'Note (facultative)';

  @override
  String get splitInvalidAmount => 'Saisissez un montant positif valide.';

  @override
  String get profileSplitDetail =>
      'Partagez les factures et réglez vos comptes';

  @override
  String get settingsThemeColorTitle => 'Couleur du thème';

  @override
  String get settingsThemeColorDetail =>
      'Choisissez la couleur d\'accent utilisée dans FINVERSE.';

  @override
  String get settingsThemeColorEmerald => 'Émeraude';

  @override
  String get settingsThemeColorIndigo => 'Indigo';

  @override
  String get settingsThemeColorOcean => 'Océan';

  @override
  String get settingsThemeColorPlum => 'Prune';

  @override
  String get settingsThemeColorAmber => 'Ambre';

  @override
  String get settingsThemeColorCustom => 'Personnalisée';

  @override
  String get settingsThemeColorCustomDetail =>
      'Créez votre propre couleur d\'accent';

  @override
  String get settingsThemeColorPickerTitle => 'Créer une couleur personnalisée';

  @override
  String get settingsThemeColorHexLabel => 'Couleur hexadécimale';

  @override
  String get settingsThemeColorHue => 'Teinte';

  @override
  String get settingsThemeColorSaturation => 'Saturation';

  @override
  String get settingsThemeColorBrightness => 'Luminosité';

  @override
  String get settingsThemeColorApply => 'Utiliser la couleur';

  @override
  String get loginUsePasskey => 'Utiliser une clé d’accès';

  @override
  String get loginPasskeyUnavailable =>
      'Les clés d’accès ne sont pas encore disponibles sur cet appareil. Utilisez l’application web FINVERSE ou connectez-vous avec votre mot de passe.';

  @override
  String get loginPasskeyCancelled =>
      'La connexion par clé d’accès a été annulée.';

  @override
  String get loginPasskeyFailed =>
      'Cette clé d’accès n’a pas pu être vérifiée.';

  @override
  String get settingsPasskeysTitle => 'Clés d’accès';

  @override
  String get settingsPasskeysUnavailableServer =>
      'Non configuré sur ce serveur';

  @override
  String get settingsPasskeysUnavailableDevice =>
      'Disponible dans l’application web FINVERSE';

  @override
  String get settingsPasskeysEmpty => 'Aucune clé d’accès sur ce compte';

  @override
  String get settingsPasskeysAdd => 'Ajouter une clé d’accès';

  @override
  String get settingsPasskeysRemove => 'Supprimer';

  @override
  String get settingsPasskeysAdded => 'Clé d’accès ajoutée.';

  @override
  String get settingsPasskeysRemoved => 'Clé d’accès supprimée.';

  @override
  String get settingsPasskeysPasswordTitle => 'Confirmez votre mot de passe';

  @override
  String get settingsPasskeysPasswordDetail =>
      'L’ajout ou la suppression d’une clé d’accès exige votre mot de passe actuel.';

  @override
  String get settingsPasskeysMfaLabel =>
      'Code d’authentification ou de récupération';

  @override
  String get settingsPasskeysContinue => 'Continuer';

  @override
  String get settingsDarkModeTitle => 'Mode sombre';

  @override
  String get settingsDarkModeOn => 'Toujours utiliser l\'apparence sombre.';

  @override
  String get settingsDarkModeOff => 'Toujours utiliser l\'apparence claire.';

  @override
  String get settingsDarkModeSystem => 'Suivre l\'apparence de votre appareil.';

  @override
  String get settingsDarkModeUseDevice =>
      'Utiliser l\'apparence de l\'appareil';
}
