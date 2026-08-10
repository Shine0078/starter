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

  factory SessionTokens.fromJson(Map<String, dynamic> json) {
    final accessToken = json['accessToken'];
    final refreshToken = json['refreshToken'];
    if (accessToken is! String || accessToken.trim().isEmpty) {
      throw const FormatException('Stored access token is empty.');
    }
    if (refreshToken is! String || refreshToken.trim().isEmpty) {
      throw const FormatException('Stored refresh token is empty.');
    }
    final expiry = json['refreshExpiresAt'];
    if (expiry != null && expiry is! String) {
      throw const FormatException('Stored refresh expiry is invalid.');
    }
    if (expiry is String &&
        expiry.isNotEmpty &&
        DateTime.tryParse(expiry) == null) {
      throw const FormatException('Stored refresh expiry is invalid.');
    }
    final userId = json['userId'];
    if (userId != null && (userId is! String || userId.trim().isEmpty)) {
      throw const FormatException('Stored session owner is invalid.');
    }
    return SessionTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      refreshExpiresAt: expiry as String? ?? '',
      userId: userId as String?,
    );
  }

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

/// The keystore could not be read right now (for example, iOS Keychain is
/// still locked immediately after a device reboot). This is different from a
/// missing or corrupt value: treating an I/O failure as a sign-out would make
/// a valid user appear to have lost their account.
class SessionStoreUnavailableException implements Exception {
  const SessionStoreUnavailableException(this.cause);

  final Object cause;

  @override
  String toString() => 'Secure session storage is temporarily unavailable.';
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
  // A clear can be interrupted while the device is locked. Keeping a small
  // tombstone lets a later launch stay signed out even if the old token could
  // not be deleted yet. A successful sign-in removes the tombstone first.
  static const _signedOutKey = 'finverse.session.signed_out';

  final FlutterSecureStorage _storage;

  @override
  Future<SessionTokens?> read() async {
    final String? signedOut;
    try {
      signedOut = await _storage.read(key: _signedOutKey);
    } catch (error) {
      // Do not clear a keystore we could not read. A locked Keychain or a
      // transient platform-channel failure is not evidence that the session
      // was revoked.
      throw SessionStoreUnavailableException(error);
    }
    if (signedOut == '1') return null;
    final String? raw;
    try {
      raw = await _storage.read(key: _key);
    } catch (error) {
      throw SessionStoreUnavailableException(error);
    }
    if (raw == null) return null;
    try {
      return SessionTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Corrupt or from an older format. Treat as signed out rather than
      // crashing the app on launch.
      try {
        await clear();
      } catch (_) {
        // A corrupt value is still not usable; failure to delete it must not
        // turn the launch path into an uncaught platform exception.
      }
      return null;
    }
  }

  @override
  Future<void> write(SessionTokens tokens) async {
    try {
      // Remove the tombstone before publishing the new session. If the token
      // write then fails, the safe result is signed out, never stale-session
      // resurrection.
      await _storage.delete(key: _signedOutKey);
      await _storage.write(key: _key, value: jsonEncode(tokens.toJson()));
    } catch (error) {
      throw SessionStoreUnavailableException(error);
    }
  }

  @override
  Future<void> clear() async {
    try {
      // Publish the tombstone first. If deletion is interrupted, the next
      // launch still observes signed-out state and cannot resurrect the old
      // refresh token.
      await _storage.write(key: _signedOutKey, value: '1');
      var tokenDeleted = false;
      try {
        await _storage.delete(key: _key);
        tokenDeleted = true;
      } finally {
        // A leftover tombstone is harmless and will be removed by the next
        // successful sign-in. Never remove it after a failed token delete.
        if (tokenDeleted) {
          try {
            await _storage.delete(key: _signedOutKey);
          } catch (_) {
            // The token is already gone; retaining the tombstone is safe.
          }
        }
      }
    } catch (error) {
      throw SessionStoreUnavailableException(error);
    }
  }
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
