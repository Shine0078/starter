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
}
