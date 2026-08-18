import 'dart:convert';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import 'passkey_ceremony_stub.dart';

export 'passkey_ceremony_stub.dart'
    show
        PasskeyAssertion,
        PasskeyAttestation,
        PasskeyCeremonyException;

/// Browser WebAuthn via navigator.credentials.
class PasskeyCeremony {
  const PasskeyCeremony();

  bool get isSupported => true;

  Future<PasskeyAssertion> authenticate(Map<String, dynamic> options) async {
    final credentials = _requireCredentials();
    final publicKey = _requestOptions(options);
    try {
      final credential = await credentials
          .get(web.CredentialRequestOptions(publicKey: publicKey))
          .toDart;
      if (credential == null) {
        throw const PasskeyCeremonyException('No passkey was selected.');
      }
      final pk = credential as web.PublicKeyCredential;
      final response = pk.response as web.AuthenticatorAssertionResponse;
      return PasskeyAssertion(
        id: pk.id,
        clientDataJson: _b64(response.clientDataJSON.toDart),
        authenticatorData: _b64(response.authenticatorData.toDart),
        signature: _b64(response.signature.toDart),
      );
    } on PasskeyCeremonyException {
      rethrow;
    } catch (error) {
      throw _mapDomError(error, 'Could not verify this passkey.');
    }
  }

  Future<PasskeyAttestation> register(Map<String, dynamic> options) async {
    final credentials = _requireCredentials();
    final publicKey = _creationOptions(options);
    try {
      final credential = await credentials
          .create(web.CredentialCreationOptions(publicKey: publicKey))
          .toDart;
      if (credential == null) {
        throw const PasskeyCeremonyException('Passkey creation was cancelled.');
      }
      final pk = credential as web.PublicKeyCredential;
      final response = pk.response as web.AuthenticatorAttestationResponse;
      return PasskeyAttestation(
        id: pk.id,
        clientDataJson: _b64(response.clientDataJSON.toDart),
        attestationObject: _b64(response.attestationObject.toDart),
      );
    } on PasskeyCeremonyException {
      rethrow;
    } catch (error) {
      throw _mapDomError(error, 'Could not create a passkey on this device.');
    }
  }

  web.CredentialsContainer _requireCredentials() {
    return web.window.navigator.credentials;
  }
}

web.PublicKeyCredentialRequestOptions _requestOptions(
  Map<String, dynamic> options,
) {
  final rp = options['rp'];
  final rpId = rp is Map ? rp['id'] as String? : options['rpId'] as String?;
  return web.PublicKeyCredentialRequestOptions(
    challenge: _bytes(options['challenge'] as String?),
    timeout: (options['timeout'] as num?)?.toInt() ?? 60000,
    rpId: rpId ?? '',
    userVerification: (options['userVerification'] as String?) ?? 'required',
  );
}

web.PublicKeyCredentialCreationOptions _creationOptions(
  Map<String, dynamic> options,
) {
  final rp = Map<String, dynamic>.from(options['rp'] as Map);
  final user = Map<String, dynamic>.from(options['user'] as Map);
  final params = (options['pubKeyCredParams'] as List<dynamic>? ?? const [])
      .map((row) {
        final map = Map<String, dynamic>.from(row as Map);
        return web.PublicKeyCredentialParameters(
          type: (map['type'] as String?) ?? 'public-key',
          alg: (map['alg'] as num?)?.toInt() ?? -7,
        );
      })
      .toList();
  final excluded = (options['excludeCredentials'] as List<dynamic>? ?? const [])
      .map((row) {
        final map = Map<String, dynamic>.from(row as Map);
        return web.PublicKeyCredentialDescriptor(
          type: (map['type'] as String?) ?? 'public-key',
          id: _bytes(map['id'] as String?),
        );
      })
      .toList();
  final selectionRaw = options['authenticatorSelection'];
  final selection = selectionRaw is Map
      ? Map<String, dynamic>.from(selectionRaw)
      : const <String, dynamic>{};
  return web.PublicKeyCredentialCreationOptions(
    rp: web.PublicKeyCredentialRpEntity(
      name: (rp['name'] as String?) ?? 'FINVERSE',
      id: (rp['id'] as String?) ?? '',
    ),
    user: web.PublicKeyCredentialUserEntity(
      name: (user['name'] as String?) ?? '',
      id: _bytes(user['id'] as String?),
      displayName: (user['displayName'] as String?) ?? (user['name'] as String?) ?? '',
    ),
    challenge: _bytes(options['challenge'] as String?),
    pubKeyCredParams: params.toJS,
    timeout: (options['timeout'] as num?)?.toInt() ?? 60000,
    excludeCredentials: excluded.toJS,
    authenticatorSelection: web.AuthenticatorSelectionCriteria(
      residentKey: (selection['residentKey'] as String?) ?? 'required',
      requireResidentKey: true,
      userVerification: (selection['userVerification'] as String?) ?? 'required',
    ),
    attestation: (options['attestation'] as String?) ?? 'none',
  );
}

JSUint8Array _bytes(String? value) {
  if (value == null || value.isEmpty) {
    throw const PasskeyCeremonyException('The server did not issue a passkey challenge.');
  }
  final normalized = base64Url.normalize(value);
  return Uint8List.fromList(base64Url.decode(normalized)).toJS;
}

String _b64(ByteBuffer buffer) {
  return base64UrlEncode(Uint8List.view(buffer)).replaceAll('=', '');
}

PasskeyCeremonyException _mapDomError(Object error, String fallback) {
  final text = error.toString();
  if (text.contains('NotAllowedError') || text.contains('AbortError')) {
    return const PasskeyCeremonyException(
      'Passkey verification was cancelled.',
      cancelled: true,
    );
  }
  if (text.contains('InvalidStateError')) {
    return const PasskeyCeremonyException(
      'That passkey is already registered on this account.',
    );
  }
  return PasskeyCeremonyException(fallback);
}
