import 'package:flutter/widgets.dart';

import 'app_localizations.dart';
import 'app_localizations_en.dart';

/// Returns the active app localization, or English for isolated embedders.
///
/// FINVERSE's app shell always installs [AppLocalizations.localizationsDelegates].
/// The fallback is deliberately limited to reusable screens so a diagnostic,
/// recovery, or authentication surface still works inside a host that omitted
/// those delegates (including focused widget tests).
AppLocalizations localizedOrEnglish(BuildContext context) {
  return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
      AppLocalizationsEn();
}
