// Deliberately imports no platform-native package. `local_auth` does not
// compile for the web, and this file defines the types every target needs;
// the native implementation lives in platform/device_auth_native.dart behind a
// conditional export.
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class AppLockStore {
  Future<bool> isEnabled();
  Future<void> setEnabled(bool enabled);
}

class SecureAppLockStore implements AppLockStore {
  SecureAppLockStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(migrateWithBackup: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const _key = 'finverse.app-lock.enabled';
  final FlutterSecureStorage _storage;

  @override
  Future<bool> isEnabled() async => await _storage.read(key: _key) == 'true';

  @override
  Future<void> setEnabled(bool enabled) =>
      _storage.write(key: _key, value: enabled ? 'true' : 'false');
}

class InMemoryAppLockStore implements AppLockStore {
  InMemoryAppLockStore({bool enabled = false}) : _enabled = enabled;

  bool _enabled;

  @override
  Future<bool> isEnabled() async => _enabled;

  @override
  Future<void> setEnabled(bool enabled) async => _enabled = enabled;
}

abstract class DeviceAuthenticator {
  Future<bool> isSupported();
  Future<bool> authenticate(String reason);
}

class UnavailableDeviceAuthenticator implements DeviceAuthenticator {
  @override
  Future<bool> authenticate(String reason) async => false;

  @override
  Future<bool> isSupported() async => false;
}

enum AppLockChangeResult { changed, unavailable, notAuthenticated, failed }

/// Owns the device-local lock state. No financial data or device credential is
/// stored here; Android/iOS performs authentication in its protected system UI.
class AppLockController extends ChangeNotifier {
  AppLockController({
    required AppLockStore store,
    required DeviceAuthenticator authenticator,
  })  : _store = store,
        _authenticator = authenticator;

  final AppLockStore _store;
  final DeviceAuthenticator _authenticator;

  bool _initialized = false;
  bool _enabled = false;
  bool _locked = false;
  bool _authenticating = false;

  bool get enabled => _enabled;
  bool get locked => _enabled && _locked;
  bool get authenticating => _authenticating;

  Future<void> initialize() async {
    if (_initialized) return;
    try {
      _enabled = await _store.isEnabled();
      _locked = _enabled;
    } catch (_) {
      // A broken keystore must fail open to the FINVERSE sign-in screen, not
      // create a permanent device lock the user cannot disable.
      _enabled = false;
      _locked = false;
    }
    _initialized = true;
    notifyListeners();
  }

  Future<AppLockChangeResult> setEnabled(bool value) async {
    await initialize();
    if (value == _enabled) return AppLockChangeResult.changed;
    if (value) {
      try {
        if (!await _authenticator.isSupported()) {
          return AppLockChangeResult.unavailable;
        }
        if (!await _authenticate(
          'Confirm your device credential to enable the FINVERSE app lock.',
        )) {
          return AppLockChangeResult.notAuthenticated;
        }
      } catch (_) {
        return AppLockChangeResult.failed;
      }
    }

    try {
      await _store.setEnabled(value);
      _enabled = value;
      _locked = false;
      notifyListeners();
      return AppLockChangeResult.changed;
    } catch (_) {
      return AppLockChangeResult.failed;
    }
  }

  void lock() {
    if (!_enabled || _locked) return;
    _locked = true;
    notifyListeners();
  }

  void markSessionAuthenticated() {
    if (!_locked) return;
    _locked = false;
    notifyListeners();
  }

  Future<bool> unlock() async {
    await initialize();
    if (!_enabled || !_locked) return true;
    try {
      final authenticated = await _authenticate(
        'Unlock FINVERSE to view your financial information.',
      );
      if (authenticated) {
        _locked = false;
        notifyListeners();
      }
      return authenticated;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _authenticate(String reason) async {
    if (_authenticating) return false;
    _authenticating = true;
    notifyListeners();
    try {
      return await _authenticator.authenticate(reason);
    } finally {
      _authenticating = false;
      notifyListeners();
    }
  }
}
