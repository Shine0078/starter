/**
 * WebAuthn/passkey ports.
 *
 * The domain-gated FIDO2 verification is the security boundary: until an
 * operator sets WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN, and WEBAUTHN_ENABLED, no
 * challenge is issued and no credential is accepted. A passkey is a bearer
 * of the session's passwordless replacement, so it is stored per user under
 * row-level security exactly like any other user-owned row.
 */

export const WEBAUTHN_VERIFIER = 'WEBAUTHN_VERIFIER';
export const WEBAUTHN_CREDENTIAL_STORE = 'WEBAUTHN_CREDENTIAL_STORE';
export const WEBAUTHN_CONFIG = 'WEBAUTHN_CONFIG';
export const WEBAUTHN_CHALLENGE_STORE = 'WEBAUTHN_CHALLENGE_STORE';

export interface WebAuthnVerifier {
  readonly configured: boolean;
  /**
   * Verifies a registration ceremony and returns the credential to persist.
   * Throws on any mismatch (challenge, origin, type, signature).
   */
  verifyRegistration(params: {
    clientDataJson: Buffer;
    attestationObject: Buffer;
    expectedChallenge: string;
  }): Promise<{ credentialId: string; publicKeyPem: string }>;
  /**
   * Verifies a login ceremony against the stored credential public key.
   * Throws on any mismatch; returns the fresh sign counter on success.
   */
  verifyAuthentication(params: {
    clientDataJson: Buffer;
    authenticatorData: Buffer;
    signature: Buffer;
    expectedChallenge: string;
    credentialId: string;
    publicKeyPem: string;
  }): Promise<{ counter: number }>;
}

export interface WebAuthnCredential {
  credentialId: string;
  publicKeyPem: string;
  counter: number;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface WebAuthnCredentialStore {
  register(
    userId: string,
    credential: WebAuthnCredential,
    createdAt: string,
  ): Promise<void>;
  list(userId: string): Promise<WebAuthnCredential[]>;
  get(userId: string, credentialId: string): Promise<WebAuthnCredential | null>;
  findByCredentialId(
    credentialId: string,
  ): Promise<{ userId: string; credential: WebAuthnCredential } | null>;
  /** Advances the sign counter only when the new value is strictly greater. */
  updateCounter(userId: string, credentialId: string, counter: number): Promise<void>;
  remove(userId: string, credentialId: string): Promise<boolean>;
  purgeUser(userId: string): Promise<void>;
}
