import '../app_lock.dart';

/// Web: there is no device credential a browser can challenge for, so the app
/// lock reports itself unavailable rather than pretending to protect anything.
DeviceAuthenticator createDeviceAuthenticator() => UnavailableDeviceAuthenticator();
