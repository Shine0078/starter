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
      other: '$count modifications enregistrées sur cet appareil et synchronisées automatiquement à la reconnexion.',
      one: '1 modification enregistrée sur cet appareil et synchronisée automatiquement à la reconnexion.',
    );
    return '$_temp0';
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
  String get planTitle => 'Forfait';

  @override
  String get helpTitle => 'Aide et soutien';

  @override
  String get languageTitle => 'Langue';

  @override
  String get languageSystemDefault => 'Utiliser la langue de l’appareil';

  @override
  String get languageEnglish => 'Anglais';

  @override
  String get languageFrench => 'Français';

  @override
  String get languageBetaDetail => 'Certaines pages sont encore en cours de traduction.';

  @override
  String get verificationEmailSent => 'E-mail de vérification envoyé.';

  @override
  String get profileSettingsPrivacyTitle => 'Paramètres et confidentialité';

  @override
  String get profileSettingsPrivacyDetail => 'Sécurité, A2F, verrouillage de l’app, consentement, exportation et contrôles de compte';

  @override
  String get profilePlanningSection => 'Planification';

  @override
  String get profileBudgetDetail => 'Définissez des limites et suivez vos catégories';

  @override
  String get profileGoalsDetail => 'Créez des objectifs d’épargne et des contributions';

  @override
  String get profileCashFlowPlanningTitle => 'Planification de trésorerie';

  @override
  String get profileCashFlowPlanningDetail => 'Prévoyez les soldes et simulez des achats';

  @override
  String get profileFinancialCalendarTitle => 'Calendrier financier';

  @override
  String get profileFinancialCalendarDetail => 'Consultez les factures, revenus, objectifs et avertissements';

  @override
  String get profileInsightsSection => 'Analyses et alertes';

  @override
  String get profileAnalyticsDetail => 'Explorez les tendances, catégories et votre santé financière';

  @override
  String get profileSubscriptionsTitle => 'Abonnements';

  @override
  String get profileSubscriptionsDetail => 'Examinez les coûts récurrents et les hausses de prix';

  @override
  String get profileNotificationsDetail => 'Consultez les alertes et vos préférences de notification';

  @override
  String get profileCategorizationRulesTitle => 'Règles de catégorisation';

  @override
  String get profileCategorizationRulesDetail => 'Examinez ou supprimez les règles enregistrées';

  @override
  String get commonDelete => 'Supprimer';

  @override
  String get assistantTitle => 'Demander à FINVERSE';

  @override
  String get assistantHeading => 'Une vision claire de votre argent';

  @override
  String get assistantDescription => 'Posez des questions sur vos dépenses, votre épargne, vos commerçants ou vos prélèvements récurrents. Les réponses utilisent les données agrégées de la période sélectionnée et restent dans FINVERSE.';

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
  String get assistantPromptSubscriptions => 'Quels abonnements est-ce que je paie ?';

  @override
  String get assistantPromptHigherSpending => 'Est-ce que mes dépenses sont plus élevées que d’habitude ?';

  @override
  String get assistantQuestionRequired => 'Posez une question sur vos dépenses ou votre épargne.';

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
  String get notificationsEmptyDetail => 'Les alertes de budget, facture, abonnement, dépense inhabituelle, solde, crédit et sécurité apparaîtront ici.';

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
  String get notificationPermissionDenied => 'Les notifications sont désactivées. Activez-les dans les réglages de votre appareil.';

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
  String get notificationDeviceUnavailable => 'Alertes de l’appareil indisponibles ici';

  @override
  String get notificationDeviceUnavailableDetail => 'Les alertes natives sont offertes dans les applications Android et iPhone.';

  @override
  String get notificationDeviceAlerts => 'Alertes de l’appareil';

  @override
  String get notificationDeviceAlertsEnabled => 'Les alertes FINVERSE non lues peuvent apparaître dans votre centre de notifications.';

  @override
  String get notificationDeviceAlertsDisabled => 'Autorisez les alertes locales pour les budgets, factures, banques et événements de sécurité non lus.';

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
  String get categorizationRulesEmptyDetail => 'Lorsque vous corrigez la catégorie d’une transaction, FINVERSE peut mémoriser ce choix pour les commerçants correspondants.';

  @override
  String get categorizationRulesIntro => 'Ces règles s’appliquent à votre compte sur tous vos appareils. Les supprimer ne modifie pas le relevé bancaire original ni les modifications existantes.';

  @override
  String get categorizationRulesDeleteTooltip => 'Supprimer la règle';

  @override
  String get errorConnection => 'Impossible de joindre le serveur. Vérifiez votre connexion.';

  @override
  String get errorServerUnavailable => 'Le serveur est temporairement indisponible. Réessayez bientôt.';

  @override
  String get errorSessionInvalid => 'Votre session n\'est plus valide. Connectez-vous à nouveau.';

  @override
  String get errorServerSide => 'Une erreur est survenue de notre côté. Réessayez bientôt.';

  @override
  String get errorTimeout => 'Le serveur n\'a pas répondu. Vérifiez votre connexion et réessayez.';

  @override
  String categoryExplanationLearned(num percent) {
    return 'Appris d’un marchand similaire que vous avez déjà catégorisé • confiance de $percent%.';
  }

  @override
  String get receiptScanPhoto => 'Numériser une photo du reçu';

  @override
  String get receiptScanPhotoDetail => 'Texte reconnu sur ce téléphone — l’image n’est jamais téléchargée';

  @override
  String get receiptPasteText => 'Coller le texte du reçu';

  @override
  String get receiptPasteTextDetail => 'Utilisez le texte copié d’un reçu ou de l’OCR de votre téléphone';

  @override
  String get receiptTakePhoto => 'Prendre une photo';

  @override
  String get receiptChoosePhoto => 'Choisir dans vos photos';

  @override
  String get receiptReviewScanned => 'Vérifier le texte numérisé du reçu';

  @override
  String get receiptPasteExplanation => 'Collez le texte du reçu. FINVERSE extrait le marchand, la date, le total et les taxes. Les images ne sont jamais téléchargées.';

  @override
  String get receiptReviewExplanation => 'Vérifiez le texte reconnu avant de le joindre. Seul ce texte est envoyé à FINVERSE — jamais la photo.';

  @override
  String get receiptAttachAction => 'Joindre';
}
