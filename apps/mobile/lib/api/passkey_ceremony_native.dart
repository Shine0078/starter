/// Native Android / iOS WebAuthn ceremony. The API still verifies the assertion.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'passkey_ceremony_stub.dart';

export 'passkey_ceremony_stub.dart'
    show
        PasskeyAssertion,
        PasskeyAttestation,
        PasskeyCeremonyException;

class PasskeyCeremony {
  const PasskeyCeremony();

  static const _channel = MethodChannel('com.finverse.finance/passkeys');

  bool get isSupported =>
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;

  Future<PasskeyAssertion> authenticate(Map<String, dynamic> options) async {
    if (!isSupported) {
      throw const PasskeyCeremonyException(
        'Passkey sign-in is available in the FINVERSE web app on this account.',
      );
    }
    try {
      final payload = await _channel.invokeMapMethod<Object?, Object?>(
        'authenticate',
        {'requestJson': jsonEncode(_assertionRequest(options))},
      );
      if (payload == null) {
        throw const PasskeyCeremonyException('No passkey was selected.');
      }
      return PasskeyAssertion(
        id: _required(payload, 'id'),
        clientDataJson: _required(payload, 'clientDataJson'),
        authenticatorData: _required(payload, 'authenticatorData'),
        signature: _required(payload, 'signature'),
      );
    } on PasskeyCeremonyException {
      rethrow;
    } on PlatformException catch (error) {
      throw _mapPlatformError(error, 'Could not verify this passkey.');
    }
  }

  Future<PasskeyAttestation> register(Map<String, dynamic> options) async {
    if (!isSupported) {
      throw const PasskeyCeremonyException(
        'Passkey setup is available in the FINVERSE web app on this account.',
      );
    }
    try {
      final payload = await _channel.invokeMapMethod<Object?, Object?>(
        'register',
        {'requestJson': jsonEncode(_creationRequest(options))},
      );
      if (payload == null) {
        throw const PasskeyCeremonyException('Passkey creation was cancelled.');
      }
      return PasskeyAttestation(
        id: _required(payload, 'id'),
        clientDataJson: _required(payload, 'clientDataJson'),
        attestationObject: _required(payload, 'attestationObject'),
      );
    } on PasskeyCeremonyException {
      rethrow;
    } on PlatformException catch (error) {
      throw _mapPlatformError(error, 'Could not create a passkey on this device.');
    }
  }
}

Map<String, dynamic> _assertionRequest(Map<String, dynamic> options) {
  final rp = options['rp'];
  final rpId = rp is Map ? rp['id'] as String? : options['rpId'] as String?;
  return {
    'challenge': options['challenge'],
    'timeout': options['timeout'] ?? 60000,
    'rpId': rpId ?? '',
    'userVerification': options['userVerification'] ?? 'required',
    'allowCredentials': options['allowCredentials'] ?? const <Map<String, dynamic>>[],
  };
}

Map<String, dynamic> _creationRequest(Map<String, dynamic> options) {
  final rp = Map<String, dynamic>.from(options['rp'] as Map);
  final user = Map<String, dynamic>.from(options['user'] as Map);
  final selectionRaw = options['authenticatorSelection'];
  final selection = selectionRaw is Map
      ? Map<String, dynamic>.from(selectionRaw)
      : const <String, dynamic>{};
  return {
    'rp': {'id': rp['id'], 'name': rp['name'] ?? 'FINVERSE'},
    'user': {
      'id': user['id'],
      'name': user['name'],
      'displayName': user['displayName'] ?? user['name'],
    },
    'challenge': options['challenge'],
    'pubKeyCredParams': options['pubKeyCredParams'] ??
        const [
          {'type': 'public-key', 'alg': -7},
        ],
    'timeout': options['timeout'] ?? 60000,
    'attestation': options['attestation'] ?? 'none',
    'excludeCredentials': options['excludeCredentials'] ?? const <Map<String, dynamic>>[],
    'authenticatorSelection': {
      'residentKey': selection['residentKey'] ?? 'required',
      'requireResidentKey': true,
      'userVerification': selection['userVerification'] ?? 'required',
    },
  };
}

String _required(Map<Object?, Object?> payload, String key) {
  final value = payload[key];
  if (value is! String || value.isEmpty) {
    throw const PasskeyCeremonyException('The authenticator returned an incomplete passkey.');
  }
  return value;
}

PasskeyCeremonyException _mapPlatformError(
  PlatformException error,
  String fallback,
) {
  switch (error.code) {
    case 'CANCELLED':
      return const PasskeyCeremonyException(
        'Passkey verification was cancelled.',
        cancelled: true,
      );
    case 'NO_CREDENTIAL':
      return const PasskeyCeremonyException('No passkey was selected.');
    case 'INVALID_STATE':
      return const PasskeyCeremonyException(
        'That passkey is already registered on this account.',
      );
    default:
      return PasskeyCeremonyException(
        (error.message == null || error.message!.isEmpty) ? fallback : error.message!,
      );
  }
}
