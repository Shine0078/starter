/**
 * WebAuthn verification core — pure functions over plain data (ADR-0002).
 *
 * Nothing here touches the network, a database, or the platform keychain; it
 * is the FIDO2 arithmetic the authenticator's signature is checked against.
 * The infrastructure layer supplies the CBOR parsing that turns an
 * attestation object into these structures; this file stays framework-free so
 * the security-critical part is exhaustively unit-testable.
 *
 * Everything is domain-gated: until an operator configures a relying-party id
 * and origin, no challenge is ever issued.
 */

import { createHash, createVerify } from 'node:crypto';

export interface WebAuthnConfig {
  /** The effective domain, e.g. `api.finverse.example`. */
  rpId: string;
  /** Exact origin the client must present, e.g. `https://api.finverse.example`. */
  origin: string;
  rpName: string;
}

export interface ParsedClientData {
  type: string;
  challenge: string;
  origin: string;
}

/** Base64url decode that tolerates the padding-less canonical form. */
export function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function base64UrlEncode(data: Buffer): string {
  return data
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function hashRpId(rpId: string): Buffer {
  return createHash('sha256').update(rpId, 'utf8').digest();
}

/**
 * Verifies the client data JSON every assertion carries. Returns the parsed
 * object on success and null on any mismatch — an attacker must match the
 * challenge, the origin, and the ceremony type at once.
 */
export function verifyClientData(
  clientDataJson: Buffer,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
): ParsedClientData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientDataJson.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== 'string' || record.type !== expectedType) return null;
  if (typeof record.challenge !== 'string' || record.challenge !== expectedChallenge) {
    return null;
  }
  if (typeof record.origin !== 'string' || record.origin !== expectedOrigin) {
    return null;
  }
  return {
    type: record.type as string,
    challenge: record.challenge as string,
    origin: record.origin as string,
  };
}

/**
 * Verifies an ES256 (P-256) signature over `authenticatorData || sha256(clientDataJSON)`
 * using the credential's public key. This is the single cryptographic check
 * that proves the holder of the private key — i.e. the passkey — actually
 * performed the ceremony.
 */
export function verifyAssertionSignature(params: {
  authenticatorData: Buffer;
  clientDataJson: Buffer;
  publicKeyPem: string;
  signature: Buffer;
}): boolean {
  const { authenticatorData, clientDataJson, publicKeyPem, signature } = params;
  const signed = Buffer.concat([
    authenticatorData,
    createHash('sha256').update(clientDataJson).digest(),
  ]);
  try {
    return createVerify('sha256').update(signed).verify(publicKeyPem, signature);
  } catch {
    // A malformed public key or signature is a failure, not a crash.
    return false;
  }
}

/** True when the authenticator's user-present flag is set. */
export function userPresent(authenticatorData: Buffer): boolean {
  if (authenticatorData.length < 37) return false;
  return (authenticatorData[32]! & 0x01) === 0x01;
}

/** 32-byte SHA-256 of the RP id, expected as the first authData field. */
export function authenticatorRpIdHash(authenticatorData: Buffer): Buffer | null {
  if (authenticatorData.length < 32) return null;
  return authenticatorData.subarray(0, 32);
}
