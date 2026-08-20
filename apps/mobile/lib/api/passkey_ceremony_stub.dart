/// Native / test default: do not invent a hardware ceremony.
class PasskeyCeremonyException implements Exception {
  const PasskeyCeremonyException(this.message, {this.cancelled = false});

  final String message;
  final bool cancelled;

  @override
  String toString() => message;
}

class PasskeyAssertion {
  const PasskeyAssertion({
    required this.id,
    required this.clientDataJson,
    required this.authenticatorData,
    required this.signature,
  });

  final String id;
  final String clientDataJson;
  final String authenticatorData;
  final String signature;
}

class PasskeyAttestation {
  const PasskeyAttestation({
    required this.id,
    required this.clientDataJson,
    required this.attestationObject,
  });

  final String id;
  final String clientDataJson;
  final String attestationObject;
}

class PasskeyCeremony {
  const PasskeyCeremony();

  bool get isSupported => false;

  Future<PasskeyAssertion> authenticate(Map<String, dynamic> options) {
    throw const PasskeyCeremonyException(
      'Passkey sign-in is available in the FINVERSE web app on this account.',
    );
  }

  Future<PasskeyAttestation> register(Map<String, dynamic> options) {
    throw const PasskeyCeremonyException(
      'Passkey setup is available in the FINVERSE web app on this account.',
    );
  }
}
