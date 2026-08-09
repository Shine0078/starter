import 'package:local_auth/local_auth.dart';

import '../app_lock.dart';

/// Android and iOS: the real system biometric / passcode prompt.
///
/// Lives here rather than in app_lock.dart because `local_auth` does not
/// compile for the web, and app_lock.dart is shared by every target.
class LocalDeviceAuthenticator implements DeviceAuthenticator {
  LocalDeviceAuthenticator({LocalAuthentication? authentication})
      : _authentication = authentication ?? LocalAuthentication();

  final LocalAuthentication _authentication;

  @override
  Future<bool> isSupported() => _authentication.isDeviceSupported();

  @override
  Future<bool> authenticate(String reason) => _authentication.authenticate(
        localizedReason: reason,
        // Allows the device PIN/passcode fallback when biometrics are not
        // enrolled. Locking the app must never strand its owner.
        biometricOnly: false,
        persistAcrossBackgrounding: true,
      );
}

DeviceAuthenticator createDeviceAuthenticator() => LocalDeviceAuthenticator();
