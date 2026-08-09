/// Picks a device authenticator that can actually be compiled for the target.
///
/// `local_auth` reaches native biometric APIs and does not compile for the web,
/// so importing it unconditionally breaks the web build outright. The
/// conditional export below selects the native implementation everywhere it
/// exists and a stub in the browser.
///
/// The stub is not a silent downgrade: it reports `isSupported() == false`, so
/// the settings screen offers the app-lock toggle as unavailable rather than
/// enabling a lock that would never challenge anyone.
library;

export 'device_auth_stub.dart' if (dart.library.io) 'device_auth_native.dart';
