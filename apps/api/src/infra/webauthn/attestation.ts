/**
 * Turns an authenticator's attestation object into a credential public key.
 * Parses the CBOR map, splits the authData, extracts the COSE EC2 key, and
 * rebuilds the SPKI DER the Node verifier can consume.
 */

import { decodeCbor, type CborValue } from './cbor';

export interface ParsedRegistration {
  credentialId: Buffer;
  publicKeyPem: string;
}

/** The COSE key labels defined by the WebAuthn spec. */
const COSE_KTY = 1;
const COSE_ALG = 3;
const COSE_CRV = -1;
const COSE_X = -2;
const COSE_Y = -3;

function toMap(value: CborValue): Map<CborValue, CborValue> {
  if (!(value instanceof Map)) throw new Error('attestation: expected a CBOR map');
  return value;
}

function toBytes(value: CborValue): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error('attestation: expected a byte string');
  return Buffer.from(value);
}

function toInt(value: CborValue): number {
  return typeof value === 'number' ? value : Number(value);
}

function derLength(bytes: number): Buffer {
  if (bytes < 128) return Buffer.from([bytes]);
  const out: number[] = [];
  let n = bytes;
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>>= 8;
  }
  return Buffer.from([0x81 + (out.length - 1), ...out]);
}

function derSequence(contents: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), derLength(contents.length), contents]);
}

function derOid(oid: number[]): Buffer {
  const body = Buffer.from([
    oid[0]! * 40 + oid[1]!,
    ...oid.slice(2).flatMap((part) => {
      const bytes: number[] = [];
      let value = part;
      bytes.unshift(value & 0x7f);
      value >>>= 7;
      while (value > 0) {
        bytes.unshift((value & 0x7f) | 0x80);
        value >>>= 7;
      }
      return bytes;
    }),
  ]);
  return Buffer.concat([Buffer.from([0x06]), derLength(body.length), body]);
}

function derBitString(bytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x03]), derLength(bytes.length + 1), Buffer.from([0x00]), bytes]);
}

/** ECDSA P-256 SPKI DER from the uncompressed point. */
function spkiP256(x: Buffer, y: Buffer): Buffer {
  const point = Buffer.concat([Buffer.from([0x04]), x, y]);
  const algorithm = derSequence(
    Buffer.concat([
      derOid([1, 2, 840, 10045, 2, 1]),
      derOid([1, 2, 840, 10045, 3, 1, 7]),
    ]),
  );
  return derSequence(Buffer.concat([algorithm, derBitString(point)]));
}

function coseToPem(cose: CborValue): Buffer {
  const map = toMap(cose);
  const kty = map.get(COSE_KTY);
  const alg = map.get(COSE_ALG);
  const crv = map.get(COSE_CRV);
  const x = map.get(COSE_X);
  const y = map.get(COSE_Y);
  if (toInt(kty!) !== 2) throw new Error('attestation: key is not EC2');
  if (toInt(alg!) !== -7) throw new Error('attestation: key is not ES256');
  if (toInt(crv!) !== 1) throw new Error('attestation: curve is not P-256');
  const xBuf = toBytes(x!);
  const yBuf = toBytes(y!);
  if (xBuf.length !== 32 || yBuf.length !== 32) {
    throw new Error('attestation: P-256 coordinates must be 32 bytes');
  }
  return spkiP256(xBuf, yBuf);
}

/**
 * Parses a WebAuthn attestation object and extracts the credential.
 * authData layout (37 bytes + credential data): rpIdHash(32) flags(1) counter(4)
 * then, for the attested credential data: aaguid(16) credIdLen(2 BE) credentialId
 * then the COSE public key.
 */
export function parseAttestationObject(
  attestationObject: Buffer,
): ParsedRegistration {
  const decoded = toMap(decodeCbor(new Uint8Array(attestationObject)));
  const rawAuthData = decoded.get('authData');
  if (rawAuthData === undefined) throw new Error('attestation: missing authData');
  const authData = toBytes(rawAuthData);
  if (authData.length < 37 + 18) throw new Error('attestation: authData too short');

  const credentialLength = authData.readUInt16BE(53);
  const credentialStart = 55;
  const credentialEnd = credentialStart + credentialLength;
  if (credentialEnd + 1 > authData.length) {
    throw new Error('attestation: credential data truncated');
  }
  const credentialId = authData.subarray(credentialStart, credentialEnd);
  const coseKey = decodeCbor(
    new Uint8Array(authData.subarray(credentialEnd)),
  );

  return {
    credentialId,
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${coseToPem(coseKey).toString('base64')}\n-----END PUBLIC KEY-----`,
  };
}
