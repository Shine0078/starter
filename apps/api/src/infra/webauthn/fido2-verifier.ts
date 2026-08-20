import {
  allowedWebAuthnOrigins,
  authenticatorRpIdHash,
  base64UrlEncode,
  attestedCredentialDataIncluded,
  hashRpId,
  userPresent,
  userVerified,
  verifyAssertionSignature,
  verifyClientData,
} from '../../domain/webauthn/verify';
import type { WebAuthnConfig } from '../../domain/webauthn/verify';
import type { WebAuthnVerifier } from '../../ports/webauthn';
import { parseAttestationObject } from './attestation';
import { decodeCbor } from './cbor';

export class Fido2Verifier implements WebAuthnVerifier {
  constructor(private readonly config: WebAuthnConfig | null) {}

  get configured(): boolean {
    return this.config !== null;
  }

  private requireConfig(): WebAuthnConfig {
    if (!this.config) {
      throw new Error('WebAuthn is not configured on this server.');
    }
    return this.config;
  }

  async verifyRegistration(params: {
    clientDataJson: Buffer;
    attestationObject: Buffer;
    expectedChallenge: string;
  }): Promise<{ credentialId: string; publicKeyPem: string }> {
    const config = this.requireConfig();

    const clientData = verifyClientData(
      params.clientDataJson,
      params.expectedChallenge,
      allowedWebAuthnOrigins(config),
      'webauthn.create',
    );
    if (!clientData) throw new Error('WebAuthn client data could not be verified.');

    const authData = extractAuthData(params.attestationObject);
    const rpIdHash = authenticatorRpIdHash(authData);
    if (!rpIdHash || !rpIdHash.equals(hashRpId(config.rpId))) {
      throw new Error('WebAuthn authenticator is bound to a different origin.');
    }
    if (!userPresent(authData)) throw new Error('WebAuthn user presence was not confirmed.');
    if (!userVerified(authData)) throw new Error('WebAuthn user verification was not confirmed.');
    if (!attestedCredentialDataIncluded(authData)) {
      throw new Error('WebAuthn attestation is missing credential data.');
    }
    const parsed = parseAttestationObject(params.attestationObject);

    return { credentialId: base64UrlEncode(Buffer.from(parsed.credentialId)), publicKeyPem: parsed.publicKeyPem };
  }

  async verifyAuthentication(params: {
    clientDataJson: Buffer;
    authenticatorData: Buffer;
    signature: Buffer;
    expectedChallenge: string;
    credentialId: string;
    publicKeyPem: string;
  }): Promise<{ counter: number }> {
    const config = this.requireConfig();

    const clientData = verifyClientData(
      params.clientDataJson,
      params.expectedChallenge,
      allowedWebAuthnOrigins(config),
      'webauthn.get',
    );
    if (!clientData) throw new Error('WebAuthn client data could not be verified.');

    const rpIdHash = authenticatorRpIdHash(params.authenticatorData);
    if (!rpIdHash || !rpIdHash.equals(hashRpId(config.rpId))) {
      throw new Error('WebAuthn authenticator is bound to a different origin.');
    }
    if (!userPresent(params.authenticatorData)) {
      throw new Error('WebAuthn user presence was not confirmed.');
    }
    if (!userVerified(params.authenticatorData)) {
      throw new Error('WebAuthn user verification was not confirmed.');
    }

    const valid = verifyAssertionSignature({
      authenticatorData: params.authenticatorData,
      clientDataJson: params.clientDataJson,
      publicKeyPem: params.publicKeyPem,
      signature: params.signature,
    });
    if (!valid) throw new Error('WebAuthn assertion signature is invalid.');

    const counter = params.authenticatorData.readUInt32BE(33);
    return { counter };
  }
}

/** The authData byte string embedded in the attestation object's CBOR. */
function extractAuthData(attestationObject: Buffer): Buffer {
  const decoded = decodeCbor(new Uint8Array(attestationObject));
  if (!(decoded instanceof Map)) throw new Error('WebAuthn attestation is malformed.');
  const authData = decoded.get('authData');
  if (!(authData instanceof Uint8Array)) throw new Error('WebAuthn attestation is missing authData.');
  return Buffer.from(authData);
}
