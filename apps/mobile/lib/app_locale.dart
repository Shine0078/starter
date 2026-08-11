import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/platform/shared_preferences_registration.dart';

/// Persistence boundary for the non-sensitive display-language preference.
///
/// Keeping it as a tiny port lets tests prove the controller behaviour without
/// a platform channel, while the production implementation uses the same
/// asynchronous preferences API as the signed-out session marker.
abstract class LocalePreferenceStore {
  Future<String?> readLanguageCode();
  Future<void> writeLanguageCode(String? languageCode);
}

class SharedPreferencesLocalePreferenceStore implements LocalePreferenceStore {
  SharedPreferencesLocalePreferenceStore({SharedPreferencesAsync? preferences})
      : _preferences = preferences ?? _createPreferences();

  static const _key = 'finverse.display_language';
  final SharedPreferencesAsync _preferences;

  static SharedPreferencesAsync _createPreferences() {
    ensureSharedPreferencesAsyncPlatform();
    return SharedPreferencesAsync();
  }

  @override
  Future<String?> readLanguageCode() => _preferences.getString(_key);

  @override
  Future<void> writeLanguageCode(String? languageCode) {
    if (languageCode == null) return _preferences.remove(_key);
    return _preferences.setString(_key, languageCode);
  }
}

/// Owns the app-wide display locale. A null locale intentionally means
/// "follow the device", rather than silently defaulting to English.
class LocaleController extends ChangeNotifier {
  LocaleController({LocalePreferenceStore? store})
      : _store = store ?? SharedPreferencesLocalePreferenceStore();

  /// A lightweight controller for deterministic widget tests. Production uses
  /// the persisted store above.
  LocaleController.inMemory({LocalePreferenceStore? store})
      : _store = store ?? InMemoryLocalePreferenceStore();

  static const supportedLanguageCodes = <String>{'en', 'fr'};

  final LocalePreferenceStore _store;
  Locale? _locale;
  var _restored = false;

  Locale? get locale => _locale;

  Future<void> restore() async {
    if (_restored) return;
    _restored = true;
    try {
      final code = await _store.readLanguageCode();
      if (code != null && supportedLanguageCodes.contains(code)) {
        _locale = Locale(code);
      }
    } catch (_) {
      // A display preference is never a reason to block sign-in or finance UI.
      // The next successful selection will overwrite a broken local value.
    }
    notifyListeners();
  }

  Future<void> select(Locale? locale) async {
    if (locale != null &&
        !supportedLanguageCodes.contains(locale.languageCode)) {
      throw ArgumentError.value(
        locale,
        'locale',
        'FINVERSE only ships English and French today.',
      );
    }
    if (_locale == locale) return;
    _locale = locale;
    notifyListeners();
    try {
      await _store.writeLanguageCode(locale?.languageCode);
    } catch (_) {
      // Keep the explicit choice for this run even when platform preferences
      // are unavailable. Future launches will safely follow the device.
    }
  }
}

class InMemoryLocalePreferenceStore implements LocalePreferenceStore {
  String? languageCode;

  @override
  Future<String?> readLanguageCode() async => languageCode;

  @override
  Future<void> writeLanguageCode(String? value) async => languageCode = value;
}

/// Makes the app-level controller available to every screen without routing a
/// locale callback through each navigation destination.
class LocaleControllerScope extends InheritedNotifier<LocaleController> {
  const LocaleControllerScope({
    required LocaleController controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static LocaleController of(BuildContext context) {
    final controller = maybeOf(context);
    assert(controller != null,
        'LocaleControllerScope is missing above this screen.');
    return controller!;
  }

  static LocaleController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<LocaleControllerScope>()
        ?.notifier;
  }
}
