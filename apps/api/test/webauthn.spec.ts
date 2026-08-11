/**
 * WebAuthn: the FIDO2 verification core, the CBOR/COSE parsing, and the API.
 *
 * The end-to-end flow is exercised with a genuinely generated P-256 key pair
 * and a hand-built authenticator attestation object, so a real passkey will
 * verify against exactly the same code path. The API endpoints are covered
 * both disabled (fail closed) and enabled.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WebAuthnConfig } from '../src/config';
import {
  authenticatorRpIdHash,
  base64UrlDecode,
  base64UrlEncode,
  hashRpId,
  userPresent,
  verifyAssertionSignature,
  verifyClientData,
} from '../src/domain/webauthn/verify';
import { Fido2Verifier } from '../src/infra/webauthn/fido2-verifier';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

const CONFIG: WebAuthnConfig = {
  rpId: 'api.finverse.test',
  origin: 'https://api.finverse.test',
  rpName: 'FINVERSE Test',
};

// ---------------------------------------------------------------- CBOR helper

function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65_536) {
    const out = Buffer.alloc(3);
    out[0] = (major << 5) | 25;
    out.writeUInt16BE(length, 1);
    return out;
  }
  const out = Buffer.alloc(5);
  out[0] = (major << 5) | 26;
  out.writeUInt32BE(length, 1);
  return out;
}

function cborEncode(value: unknown): Buffer {
  if (typeof value === 'number') {
    if (value >= 0) return cborHead(0, value);
    return cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(2, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([cborHead(4, value.length), ...value.map(cborEncode)]);
  }
  if (value instanceof Map) {
    const entries: Buffer[] = [];
    for (const [k, v] of value) entries.push(cborEncode(k), cborEncode(v));
    return Buffer.concat([cborHead(5, value.size), ...entries]);
  }
  if (value === true) return Buffer.from([0xf5]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === null) return Buffer.from([0xf6]);
  throw new Error(`cborEncode: unsupported ${String(value)}`);
}

// ------------------------------------------------------------ authenticator

/** Builds a 37-byte authData (rpIdHash + flags + counter). */
function authData(rpId: string, counter = 1, flags = 0x05): Buffer {
  const out = Buffer.alloc(37);
  hashRpId(rpId).copy(out, 0);
  out[32] = flags;
  out.writeUInt32BE(counter, 33);
  return out;
}

/** Builds authenticatorData including the attested credential for registrations. */
function registrationAuthData(rpId: string, credentialId: Buffer, coseKey: Buffer): Buffer {
  const base = Buffer.concat([
    hashRpId(rpId),
    Buffer.from([0x41]),
    Buffer.alloc(4),
    Buffer.alloc(16),
  ]);
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(credentialId.length);
  return Buffer.concat([base, idLen, credentialId, coseKey]);
}

/** COSE EC2 key for P-256 with the given x/y coordinates. */
function coseEc2Key(x: Buffer, y: Buffer): Buffer {
  const map = new Map<number, unknown>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, new Uint8Array(x)],
    [-3, new Uint8Array(y)],
  ]);
  return cborEncode(map);
}

function derSign(data: Buffer, privateKey: Buffer): Buffer {
  const signature = sign('sha256', data, privateKey);
  return signature;
}

// -------------------------------------------------------------------- domain

describe('webauthn verify core', () => {
  it('verifies client data only when type, challenge, and origin all match', () => {
    const challenge = base64UrlEncode(Buffer.from('challenge-bytes'));
    const good = JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin: CONFIG.origin,
    });
    expect(
      verifyClientData(Buffer.from(good), challenge, CONFIG.origin, 'webauthn.create'),
    ).not.toBeNull();
    expect(
      verifyClientData(
        Buffer.from(good.replace(challenge, 'other')),
        challenge,
        CONFIG.origin,
        'webauthn.create',
      ),
    ).toBeNull();
    expect(
      verifyClientData(Buffer.from(good), challenge, 'https://evil.example', 'webauthn.create'),
    ).toBeNull();
    expect(
      verifyClientData(Buffer.from(good), challenge, CONFIG.origin, 'webauthn.get'),
    ).toBeNull();
  });

  it('verifies the assertion signature over authData and client data hash', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const auth = authData(CONFIG.rpId);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get' }));
    const signature = derSign(Buffer.concat([auth, createHash('sha256').update(clientData).digest()]), privateKey);
    expect(
      verifyAssertionSignature({
        authenticatorData: auth,
        clientDataJson: clientData,
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
        signature,
      }),
    ).toBe(true);
    expect(
      verifyAssertionSignature({
        authenticatorData: auth,
        clientDataJson: Buffer.from('{"type":"tampered"}'),
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
        signature,
      }),
    ).toBe(false);
  });

  it('reports the user-presence flag and rp id hash', () => {
    expect(userPresent(authData(CONFIG.rpId, 1, 0x05))).toBe(true);
    expect(userPresent(authData(CONFIG.rpId, 1, 0x04))).toBe(false);
    expect(authenticatorRpIdHash(authData(CONFIG.rpId))?.equals(hashRpId(CONFIG.rpId))).toBe(true);
  });
});

// ------------------------------------------------------------------- verifier

describe('Fido2Verifier', () => {
  const verifier = new Fido2Verifier(CONFIG);

  it('registers a hand-built passkey and then verifies its login', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const key = publicKey.export({ type: 'spki', format: 'der' });
    // Uncompressed point: tag || x || y.
    const point = key.subarray(key.length - 65);
    const x = point.subarray(1, 33);
    const y = point.subarray(33, 65);
    const credentialId = Buffer.from('test-credential-id');
    const coseKey = coseEc2Key(x, y);

    const challenge = base64UrlEncode(Buffer.from('reg-challenge'));
    const clientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge, origin: CONFIG.origin }),
    );
    const auth = registrationAuthData(CONFIG.rpId, credentialId, coseKey);
    const attestationObject = cborEncode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, unknown>()],
        ['authData', new Uint8Array(auth)],
      ]),
    );

    const registration = await verifier.verifyRegistration({
      clientDataJson: clientData,
      attestationObject,
      expectedChallenge: challenge,
    });
    expect(registration.credentialId).toBe(base64UrlEncode(credentialId));
    expect(registration.publicKeyPem).toContain('BEGIN PUBLIC KEY');

    // Login ceremony with the same credential.
    const loginChallenge = base64UrlEncode(Buffer.from('login-challenge'));
    const loginClientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: loginChallenge, origin: CONFIG.origin }),
    );
    const loginAuthData = authData(CONFIG.rpId, 7);
    const signed = Buffer.concat([loginAuthData, createHash('sha256').update(loginClientData).digest()]);
    const signature = derSign(signed, privateKey);

    const login = await verifier.verifyAuthentication({
      clientDataJson: loginClientData,
      authenticatorData: loginAuthData,
      signature,
      expectedChallenge: loginChallenge,
      credentialId: registration.credentialId,
      publicKeyPem: registration.publicKeyPem,
    });
    expect(login.counter).toBe(7);

    // A wrong signature must fail closed.
    const badSignature = derSign(signed, generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey);
    await expect(
      verifier.verifyAuthentication({
        clientDataJson: loginClientData,
        authenticatorData: loginAuthData,
        signature: badSignature,
        expectedChallenge: loginChallenge,
        credentialId: registration.credentialId,
        publicKeyPem: registration.publicKeyPem,
      }),
    ).rejects.toThrow(/invalid/i);
  });

  it('fails closed when WebAuthn is not configured', async () => {
    const unconfigured = new Fido2Verifier(null);
    expect(unconfigured.configured).toBe(false);
    await expect(
      unconfigured.verifyRegistration({
        clientDataJson: Buffer.from('{}'),
        attestationObject: Buffer.from('{}'),
        expectedChallenge: 'x',
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

// ----------------------------------------------------------------------- API

process.env.WEBAUTHN_ENABLED = 'true';
process.env.WEBAUTHN_RP_ID = CONFIG.rpId;
process.env.WEBAUTHN_ORIGIN = CONFIG.origin;

describe('webauthn API', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { loadConfig } = await import('../src/config');
    const { installHttpControls } = await import('../src/infra/http/controls');
    installHttpControls(app as NestExpressApplication, loadConfig());
    app.setGlobalPrefix('api', { exclude: ['healthz'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    http = await app.getUrl().then((url) => url.replace('[::1]', '127.0.0.1'));
  });

  afterAll(async () => {
    await app?.close();
  });

  let counter = 0;
  const freshEmail = (): string => `webauthn${(counter += 1)}-${Date.now()}@example.com`;

  async function register() {
    const email = freshEmail();
    const response = await request(http).post('/api/auth/register').send({
      email,
      password: 'correct horse battery staple',
      acceptedTerms: true,
      termsVersion: 'terms-test-v1',
      acceptedPrivacyNotice: true,
      privacyVersion: 'privacy-test-v1',
    });
    return { tokens: response.body.tokens as { accessToken: string } };
  }

  it('reports availability and requires a token for registration', async () => {
    const status = await request(http).get('/api/webauthn/status').expect(200);
    expect(status.body.available).toBe(true);
    await request(http).post('/api/webauthn/register/options').expect(401);
  });

  it('issues registration options for a signed-in user', async () => {
    const { tokens } = await register();
    const response = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(201);
    expect(response.body.challenge).toBeTruthy();
    expect(response.body.rp.id).toBe(CONFIG.rpId);
  });

  it('rejects a malformed registration response', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(201);
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        id: 'cred',
        response: { clientDataJSON: 'not-base64!!', attestationObject: 'x' },
      })
      .expect(400);
  });
});
