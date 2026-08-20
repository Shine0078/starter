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
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { WebAuthnConfig } from '../src/config';
import {
  authenticatorRpIdHash,
  base64UrlDecode,
  base64UrlEncode,
  hashRpId,
  userPresent,
  userVerified,
  verifyAssertionSignature,
  verifyClientData,
} from '../src/domain/webauthn/verify';
import { totpAt } from '../src/domain/auth/totp';
import { Fido2Verifier } from '../src/infra/webauthn/fido2-verifier';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

// MFA-enabled passkey enroll/remove needs the same cipher production uses.
// Without it, /auth/mfa/enroll fails closed with 503 and the step-up tests
// never reach WebAuthn.
process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const CONFIG: WebAuthnConfig = {
  rpId: 'api.finverse.test',
  origins: ['https://api.finverse.test'],
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
    Buffer.from([0x45]),
    Buffer.alloc(4),
    Buffer.alloc(16),
  ]);
  const idLen = Buffer.alloc(2);
  idLen.writeUInt16BE(credentialId.length);
  return Buffer.concat([base, idLen, credentialId, coseKey]);
}

/** COSE EC2 key for P-256 with the given x/y coordinates. */
function cosePoint(publicKey: KeyObject): { x: Buffer; y: Buffer } {
  const key = publicKey.export({ type: 'spki', format: 'der' });
  const point = key.subarray(key.length - 65);
  return { x: point.subarray(1, 33), y: point.subarray(33, 65) };
}

function buildRegistration(
  challenge: string,
  credentialId: Buffer,
  publicKey: KeyObject,
): { id: string; clientDataJSON: string; attestationObject: string } {
  const { x, y } = cosePoint(publicKey);
  const auth = registrationAuthData(CONFIG.rpId, credentialId, coseEc2Key(x, y));
  const clientData = Buffer.from(
    JSON.stringify({ type: 'webauthn.create', challenge, origin: CONFIG.origin }),
  );
  const attestationObject = cborEncode(
    new Map<string, unknown>([
      ['fmt', 'none'],
      ['attStmt', new Map<string, unknown>()],
      ['authData', new Uint8Array(auth)],
    ]),
  );
  return {
    id: base64UrlEncode(credentialId),
    clientDataJSON: base64UrlEncode(clientData),
    attestationObject: base64UrlEncode(attestationObject),
  };
}

function buildAssertion(
  challenge: string,
  privateKey: KeyObject,
  counter = 1,
  flags = 0x05,
  origin = CONFIG.origin,
  rpId = CONFIG.rpId,
): { clientDataJSON: string; authenticatorData: string; signature: string } {
  const clientData = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge, origin }),
  );
  const authenticator = authData(rpId, counter, flags);
  const signature = derSign(
    Buffer.concat([authenticator, createHash('sha256').update(clientData).digest()]),
    privateKey,
  );
  return {
    clientDataJSON: base64UrlEncode(clientData),
    authenticatorData: base64UrlEncode(authenticator),
    signature: base64UrlEncode(signature),
  };
}
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

function derSign(data: Buffer, privateKey: KeyObject): Buffer {
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
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        signature,
      }),
    ).toBe(true);
    expect(
      verifyAssertionSignature({
        authenticatorData: auth,
        clientDataJson: Buffer.from('{"type":"tampered"}'),
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        signature,
      }),
    ).toBe(false);
  });

  it('reports the user-presence and user-verified flags and rp id hash', () => {
    expect(userPresent(authData(CONFIG.rpId, 1, 0x05))).toBe(true);
    expect(userPresent(authData(CONFIG.rpId, 1, 0x01))).toBe(true);
    expect(userPresent(authData(CONFIG.rpId, 1, 0x04))).toBe(false);
    expect(userVerified(authData(CONFIG.rpId, 1, 0x05))).toBe(true);
    expect(userVerified(authData(CONFIG.rpId, 1, 0x01))).toBe(false);
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

  it('accepts any allowlisted origin while still rejecting others', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const allowlisted = {
      ...CONFIG,
      origins: ['https://app.finverse.test', CONFIG.origin],
      origin: 'https://app.finverse.test',
    };
    const verifier = new Fido2Verifier(allowlisted);
    const key = publicKey.export({ type: 'spki', format: 'der' });
    const point = key.subarray(key.length - 65);
    const credentialId = Buffer.from('allowlist-credential-id');
    const challenge = base64UrlEncode(Buffer.from('allowlist-reg'));
    const clientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge,
        origin: CONFIG.origin,
      }),
    );
    const auth = registrationAuthData(
      CONFIG.rpId,
      credentialId,
      coseEc2Key(point.subarray(1, 33), point.subarray(33, 65)),
    );
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

    const loginChallenge = base64UrlEncode(Buffer.from('allowlist-login'));
    const loginClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: loginChallenge,
        origin: 'https://app.finverse.test',
      }),
    );
    const loginAuthData = authData(CONFIG.rpId, 9);
    const signed = Buffer.concat([
      loginAuthData,
      createHash('sha256').update(loginClientData).digest(),
    ]);
    const login = await verifier.verifyAuthentication({
      clientDataJson: loginClientData,
      authenticatorData: loginAuthData,
      signature: derSign(signed, privateKey),
      expectedChallenge: loginChallenge,
      credentialId: registration.credentialId,
      publicKeyPem: registration.publicKeyPem,
    });
    expect(login.counter).toBe(9);

    const evilClientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: loginChallenge,
        origin: 'https://evil.example',
      }),
    );
    await expect(
      verifier.verifyAuthentication({
        clientDataJson: evilClientData,
        authenticatorData: loginAuthData,
        signature: derSign(signed, privateKey),
        expectedChallenge: loginChallenge,
        credentialId: registration.credentialId,
        publicKeyPem: registration.publicKeyPem,
      }),
    ).rejects.toThrow(/client data/i);
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
    return { email, tokens: response.body.tokens as { accessToken: string } };
  }

    it('lets an unauthenticated client start and submit a passkey login ceremony', async () => {
    const options = await request(http)
      .post('/api/webauthn/login/options')
      .send({})
      .expect(200);
    expect(options.body.challenge).toBeTruthy();
    expect(options.body.userVerification).toBe('required');
    expect(options.body.ceremonyId).toBeTruthy();

    const verify = await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: 'not-a-real-credential',
        ceremonyId: options.body.ceremonyId,
        response: {
          clientDataJSON: base64UrlEncode(Buffer.from('{}')),
          authenticatorData: base64UrlEncode(Buffer.alloc(37)),
          signature: base64UrlEncode(Buffer.alloc(64)),
        },
      });

    // The ceremony is public. A garbage assertion still fails closed, but
    // must not look like a missing-bearer rejection from AuthGuard.
    expect(verify.status).toBe(401);
    expect(JSON.stringify(verify.body)).not.toMatch(/Missing bearer token/i);
    expect(verify.body.message).toBe('This passkey could not be verified.');
  });
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
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    expect(response.body.challenge).toBeTruthy();
    expect(response.body.rp.id).toBe(CONFIG.rpId);
  });

  it('registers a passkey after step-up and issues a normal session on login', async () => {
    const account = await register();
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credentialId = Buffer.from(`cred-${account.email}`);

    const options = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    expect(options.body.userVerification ?? options.body.authenticatorSelection.userVerification).toBeTruthy();
    expect(options.body.allowCredentials).toBeUndefined();

    const registration = buildRegistration(options.body.challenge, credentialId, publicKey);
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({
        id: registration.id,
        ceremonyId: options.body.ceremonyId,
        password: 'correct horse battery staple',
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: registration.attestationObject,
        },
      })
      .expect(201);

    const known = await request(http).post('/api/webauthn/login/options').send({ email: account.email }).expect(200);
    const unknown = await request(http).post('/api/webauthn/login/options').send({ email: 'nobody@example.com' }).expect(200);
    expect(known.body.allowCredentials).toBeUndefined();
    expect(unknown.body.allowCredentials).toBeUndefined();
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());

    const assertion = buildAssertion(known.body.challenge, privateKey, 2);
    const verified = await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: registration.id,
        ceremonyId: known.body.ceremonyId,
        response: assertion,
      })
      .expect(200);
    expect(verified.body.user.email).toBe(account.email);
    expect(verified.body.tokens.accessToken).toBeTruthy();
    expect(verified.body.tokens.refreshToken).toBeTruthy();

    const me = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${verified.body.tokens.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(account.email);

    const replay = await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: registration.id,
        ceremonyId: known.body.ceremonyId,
        response: assertion,
      })
      .expect(401);
    expect(replay.body.message).toBe('This passkey could not be verified.');

    await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${verified.body.tokens.accessToken}`)
      .expect(400);
  });

  it('rejects a missing-UV assertion and a wrong origin', async () => {
    const account = await register();
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credentialId = Buffer.from(`uv-${account.email}`);
    const options = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    const registration = buildRegistration(options.body.challenge, credentialId, publicKey);
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({
        id: registration.id,
        ceremonyId: options.body.ceremonyId,
        password: 'correct horse battery staple',
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: registration.attestationObject,
        },
      })
      .expect(201);

    const login = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
    const missingUv = buildAssertion(login.body.challenge, privateKey, 3, 0x01);
    const rejected = await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: registration.id,
        ceremonyId: login.body.ceremonyId,
        response: missingUv,
      })
      .expect(401);
    expect(rejected.body.message).toBe('This passkey could not be verified.');

    const second = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
    const wrongOrigin = buildAssertion(second.body.challenge, privateKey, 4, 0x05, 'https://evil.example');
    await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: registration.id,
        ceremonyId: second.body.ceremonyId,
        response: wrongOrigin,
      })
      .expect(401);
  });
  it('rejects a registration whose id does not match the attested credential', async () => {
    const { tokens } = await register();
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const options = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    const registration = buildRegistration(
      options.body.challenge,
      Buffer.from('attested-id'),
      publicKey,
    );
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        id: 'different-id',
        ceremonyId: options.body.ceremonyId,
        password: 'correct horse battery staple',
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: registration.attestationObject,
        },
      })
      .expect(404);
  });

  it('rejects a registration whose attested credential flag is unset', async () => {
    const { tokens } = await register();
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const options = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    const registration = buildRegistration(
      options.body.challenge,
      Buffer.from('no-at-flag'),
      publicKey,
    );
    const attestation = base64UrlDecode(registration.attestationObject);
    // Flip AT off while leaving the rest of the hand-built object intact.
    const authDataStart = attestation.indexOf(hashRpId(CONFIG.rpId));
    expect(authDataStart).toBeGreaterThanOrEqual(0);
    attestation[authDataStart + 32] = 0x05;
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        id: registration.id,
        ceremonyId: options.body.ceremonyId,
        password: 'correct horse battery staple',
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: base64UrlEncode(attestation),
        },
      })
      .expect(404);
  });

  it('locks further passkey assertions after repeated failures on a known credential', async () => {
    const account = await register();
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const options = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    const registration = buildRegistration(options.body.challenge, Buffer.from(`lock-${account.email}`), publicKey);
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${account.tokens.accessToken}`)
      .send({
        id: registration.id,
        ceremonyId: options.body.ceremonyId,
        password: 'correct horse battery staple',
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: registration.attestationObject,
        },
      })
      .expect(201);
    for (let i = 0; i < 8; i += 1) {
      const login = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: login.body.ceremonyId,
          response: buildAssertion(login.body.challenge, privateKey, i + 10, 0x01),
        })
        .expect(401);
    }
    const locked = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
    const blocked = await request(http)
      .post('/api/webauthn/login/verify')
      .send({
        id: registration.id,
        ceremonyId: locked.body.ceremonyId,
        response: buildAssertion(locked.body.challenge, privateKey, 20),
      });
    expect(blocked.status).toBe(429);
  });

  it('rejects passkey management with the wrong password', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'this is not the password' })
      .expect(401);
    await request(http)
      .delete('/api/webauthn/credentials/not-a-credential')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'this is not the password' })
      .expect(401);
  });

  it('requires the authenticator code when MFA is enabled for passkey setup', async () => {
    const { tokens } = await register();
    const enrollment = await request(http)
      .post('/api/auth/mfa/enroll')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    const code = totpAt(enrollment.body.secret, new Date()).code;
    await request(http)
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ code })
      .expect(200);
    await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(401);
    const allowed = await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        password: 'correct horse battery staple',
        mfaCode: totpAt(enrollment.body.secret, new Date()).code,
      })
      .expect(201);
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const registration = buildRegistration(
      allowed.body.challenge,
      Buffer.from('mfa-enroll'),
      publicKey,
    );
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        id: registration.id,
        ceremonyId: allowed.body.ceremonyId,
        password: 'correct horse battery staple',
        mfaCode: totpAt(enrollment.body.secret, new Date()).code,
        response: {
          clientDataJSON: registration.clientDataJSON,
          attestationObject: registration.attestationObject,
        },
      })
      .expect(201);
  });

  it('rejects a malformed registration response', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/webauthn/register/options')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ password: 'correct horse battery staple' })
      .expect(201);
    await request(http)
      .post('/api/webauthn/register/verify')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        id: 'cred',
        ceremonyId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        password: 'correct horse battery staple',
        response: { clientDataJSON: 'not-base64!!', attestationObject: 'x' },
      })
      .expect(400);
  });
});
