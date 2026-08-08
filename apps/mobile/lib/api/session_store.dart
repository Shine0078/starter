import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The tokens for the signed-in session.
class SessionTokens {
  const SessionTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.refreshExpiresAt,
    this.userId,
  });

  factory SessionTokens.fromJson(Map<String, dynamic> json) => SessionTokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        refreshExpiresAt: json['refreshExpiresAt'] as String? ?? '',
        userId: json['userId'] as String?,
      );

  final String accessToken;
  final String refreshToken;
  final String refreshExpiresAt;
  final String? userId;

  SessionTokens withUserId(String? value) => SessionTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        refreshExpiresAt: refreshExpiresAt,
        userId: value,
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'refreshExpiresAt': refreshExpiresAt,
        if (userId != null) 'userId': userId,
      };
}

/// Where session tokens live on the device.
///
/// Backed by the platform keystore — Keychain on iOS, EncryptedSharedPreferences
/// on Android — rather than plain shared preferences. A refresh token is a
/// long-lived credential for someone's bank data; on a rooted or jailbroken
/// device, plaintext preferences are readable by any app that gets there first.
///
/// This is an interface with a concrete default so tests can substitute an
/// in-memory version without touching platform channels.
abstract class SessionStore {
  Future<SessionTokens?> read();
  Future<void> write(SessionTokens tokens);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(migrateWithBackup: true),
              iOptions: IOSOptions(
                // Not available until the device has been unlocked once after
                // boot, and never synced to iCloud or a device backup.
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const _key = 'finverse.session';

  final FlutterSecureStorage _storage;

  @override
  Future<SessionTokens?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      return SessionTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Corrupt or from an older format. Treat as signed out rather than
      // crashing the app on launch.
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(SessionTokens tokens) =>
      _storage.write(key: _key, value: jsonEncode(tokens.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// Test double. Also used by widget tests so they never touch a platform channel.
class InMemorySessionStore implements SessionStore {
  SessionTokens? _tokens;

  @override
  Future<SessionTokens?> read() async => _tokens;

  @override
  Future<void> write(SessionTokens tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}
