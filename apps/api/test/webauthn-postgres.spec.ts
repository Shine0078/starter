/**
 * PostgreSQL/RLS passkey login release gate.
 *
 * Boots the real Nest graph against the restricted runtime role and proves a
 * fresh unauthenticated client can complete a WebAuthn ceremony, receive a
 * normal FINVERSE session, and call /auth/me. In-memory success is not enough.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseAppRole } from '../src/infra/postgres/app-role';
import { closePool } from '../src/infra/postgres/pool';
import {
  authenticatorRpIdHash,
  base64UrlEncode,
  hashRpId,
} from '../src/domain/webauthn/verify';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

const CONFIG = {
  rpId: 'api.finverse.test',
  origin: 'https://api.finverse.test',
  rpName: 'FINVERSE Test',
};
const PASSWORD = 'correct horse battery staple';
const LEGAL = {
  acceptedTerms: true,
  termsVersion: 'terms-test-v1',
  acceptedPrivacyNotice: true,
  privacyVersion: 'privacy-test-v1',
};

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

function authData(rpId: string, counter = 1, flags = 0x05): Buffer {
  const out = Buffer.alloc(37);
  hashRpId(rpId).copy(out, 0);
  out[32] = flags;
  out.writeUInt32BE(counter, 33);
  return out;
}

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

function coseEc2Key(x: Buffer, y: Buffer): Buffer {
  return cborEncode(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(x)],
      [-3, new Uint8Array(y)],
    ]),
  );
}

function buildRegistration(
  challenge: string,
  credentialId: Buffer,
  publicKey: KeyObject,
) {
  const key = publicKey.export({ type: 'spki', format: 'der' });
  const point = key.subarray(key.length - 65);
  const auth = registrationAuthData(
    CONFIG.rpId,
    credentialId,
    coseEc2Key(point.subarray(1, 33), point.subarray(33, 65)),
  );
  const clientData = Buffer.from(
    JSON.stringify({ type: 'webauthn.create', challenge, origin: CONFIG.origin }),
  );
  return {
    id: base64UrlEncode(credentialId),
    clientDataJSON: base64UrlEncode(clientData),
    attestationObject: base64UrlEncode(
      cborEncode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, unknown>()],
          ['authData', new Uint8Array(auth)],
        ]),
      ),
    ),
  };
}

function buildAssertion(
  challenge: string,
  privateKey: KeyObject,
  counter = 1,
  flags = 0x05,
  origin = CONFIG.origin,
  rpId = CONFIG.rpId,
) {
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
  const authenticator = authData(rpId, counter, flags);
  const signature = sign(
    'sha256',
    Buffer.concat([authenticator, createHash('sha256').update(clientData).digest()]),
    privateKey,
  );
  return {
    clientDataJSON: base64UrlEncode(clientData),
    authenticatorData: base64UrlEncode(authenticator),
    signature: base64UrlEncode(signature),
  };
}

if (!OWNER_URL) {
  describe('webauthn PostgreSQL login', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
} else {
  process.env.STORE = 'postgres';
  process.env.DATABASE_URL = OWNER_URL;
  process.env.DATABASE_APP_URL = process.env.TEST_DATABASE_APP_URL;
  process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
  process.env.LEGAL_TERMS_VERSION = 'terms-test-v1';
  process.env.LEGAL_TERMS_URL = 'https://finverse.example/legal/terms-test-v1';
  process.env.LEGAL_PRIVACY_VERSION = 'privacy-test-v1';
  process.env.LEGAL_PRIVACY_URL = 'https://finverse.example/legal/privacy-test-v1';
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.THROTTLE_DISABLED = 'true';
  process.env.WEBAUTHN_ENABLED = 'true';
  process.env.WEBAUTHN_RP_ID = CONFIG.rpId;
  process.env.WEBAUTHN_ORIGIN = CONFIG.origin;

  describe('webauthn PostgreSQL login', () => {
    let harness: PgHarness;
    let app: INestApplication;
    let http: string;
    let counter = 0;
    const freshEmail = (): string => `wa-pg-${(counter += 1)}-${Date.now()}@example.com`;

    beforeAll(async () => {
      harness = await startPgHarness(OWNER_URL!);
      process.env.DATABASE_APP_URL = harness.appUrl;
      const { resetConfigForTests } = await import('../src/config');
      resetConfigForTests();
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
      await harness?.close();
      await closePool();
    });

    async function registerAccount() {
      const email = freshEmail();
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD, ...LEGAL })
        .expect(201);
      return {
        email,
        userId: response.body.user.id as string,
        tokens: response.body.tokens as { accessToken: string; refreshToken: string },
      };
    }

    it('completes unauthenticated passkey login under forced RLS', async () => {
      const { role } = parseAppRole(harness.appUrl);
      const { rows: who } = await harness.app.query<{ user: string }>('SELECT current_user AS user');
      expect(who[0]?.user).toBe(role);

      const account = await registerAccount();
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const credentialId = Buffer.from(`pg-${account.userId}`);

      const options = await request(http)
        .post('/api/webauthn/register/options')
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(201);
      const registration = buildRegistration(options.body.challenge, credentialId, publicKey);
      await request(http)
        .post('/api/webauthn/register/verify')
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .send({
          id: registration.id,
          ceremonyId: options.body.ceremonyId,
          password: PASSWORD,
          response: {
            clientDataJSON: registration.clientDataJSON,
            attestationObject: registration.attestationObject,
          },
        })
        .expect(201);

      const unscoped = await harness.app.query(
        'SELECT user_id FROM webauthn_credentials WHERE credential_id = $1',
        [registration.id],
      );
      expect(unscoped.rows).toHaveLength(0);
      const routed = await harness.app.query<{ user_id: string }>(
        'SELECT user_id FROM finverse_webauthn_credential_owner($1)',
        [registration.id],
      );
      expect(routed.rows).toEqual([{ user_id: account.userId }]);

      const login = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      expect(login.body.ceremonyId).toBeTruthy();
      expect(login.body.allowCredentials).toBeUndefined();
      const assertion = buildAssertion(login.body.challenge, privateKey, 2);
      const verified = await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: login.body.ceremonyId,
          response: assertion,
        })
        .expect(200);
      expect(verified.body.user.id).toBe(account.userId);
      expect(verified.body.tokens.accessToken).toBeTruthy();
      expect(verified.body.tokens.refreshToken).toBeTruthy();

      const me = await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${verified.body.tokens.accessToken}`)
        .expect(200);
      expect(me.body.id).toBe(account.userId);

      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: login.body.ceremonyId,
          response: assertion,
        })
        .expect(401);
    });

    it('rejects expired, reused, malformed, and unauthorized management attempts', async () => {
      const account = await registerAccount();
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const options = await request(http)
        .post('/api/webauthn/register/options')
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(201);
      const registration = buildRegistration(
        options.body.challenge,
        Buffer.from(`neg-${account.userId}`),
        publicKey,
      );
      await request(http)
        .post('/api/webauthn/register/verify')
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .send({
          id: registration.id,
          ceremonyId: options.body.ceremonyId,
          password: PASSWORD,
          response: {
            clientDataJSON: registration.clientDataJSON,
            attestationObject: registration.attestationObject,
          },
        })
        .expect(201);

      const expired = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await harness.owner.query(
        "UPDATE webauthn_challenges SET expires_at = now() - interval '1 minute'",
      );
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: expired.body.ceremonyId,
          response: buildAssertion(expired.body.challenge, privateKey, 3),
        })
        .expect(401);

      const login = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: 'unknown-credential',
          ceremonyId: login.body.ceremonyId,
          response: buildAssertion(login.body.challenge, privateKey, 4),
        })
        .expect(401);

      const origin = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: origin.body.ceremonyId,
          response: buildAssertion(origin.body.challenge, privateKey, 5, 0x05, 'https://evil.example'),
        })
        .expect(401);

      const rp = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: rp.body.ceremonyId,
          response: buildAssertion(rp.body.challenge, privateKey, 6, 0x05, CONFIG.origin, 'evil.example'),
        })
        .expect(401);

      const uv = await request(http).post('/api/webauthn/login/options').send({}).expect(200);
      await request(http)
        .post('/api/webauthn/login/verify')
        .send({
          id: registration.id,
          ceremonyId: uv.body.ceremonyId,
          response: buildAssertion(uv.body.challenge, privateKey, 7, 0x01),
        })
        .expect(401);

      await request(http)
        .post('/api/webauthn/register/options')
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .expect(400);
      await request(http)
        .delete(`/api/webauthn/credentials/${encodeURIComponent(registration.id)}`)
        .set('Authorization', `Bearer ${account.tokens.accessToken}`)
        .expect(400);
    });
  });
}
