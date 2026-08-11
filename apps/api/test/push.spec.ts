/**
 * Push device-token registration over real HTTP. Delivery itself stays an
 * external gate (FCM/APNs credentials); what is verified here is that a
 * registered device is stored per user, unregistration works, and one user
 * can never reach another user's registration.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PUSH_TOKEN_STORE, type PushTokenStore } from '../src/ports/push';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

const PASSWORD = 'correct horse battery staple';
const TOKEN = 'fcm-device-token-00000000000000000000';

describe('push API', () => {
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
  const freshEmail = (): string => `push${(counter += 1)}-${Date.now()}@example.com`;

  async function register() {
    const email = freshEmail();
    const response = await request(http).post('/api/auth/register').send({
      email,
      password: PASSWORD,
      acceptedTerms: true,
      termsVersion: 'terms-test-v1',
      acceptedPrivacyNotice: true,
      privacyVersion: 'privacy-test-v1',
    });
    return { tokens: response.body.tokens as { accessToken: string } };
  }

  it('requires a token', async () => {
    await request(http)
      .post('/api/push/device')
      .send({ token: TOKEN, platform: 'android' })
      .expect(401);
  });

  it('registers a device token and unregisters it', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/push/device')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ token: TOKEN, platform: 'android' })
      .expect(201);

    const me = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const store = app.get(PUSH_TOKEN_STORE) as PushTokenStore & {
      bucket?: (userId: string) => unknown;
    };
    const registered = (store as unknown as {
      byUser: Map<string, Map<string, string>>;
    }).byUser.get(me.body.id as string);
    expect(registered?.has(TOKEN)).toBe(true);

    await request(http)
      .delete('/api/push/device')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ token: TOKEN })
      .expect(204);
    const after = (store as unknown as {
      byUser: Map<string, Map<string, string>>;
    }).byUser.get(me.body.id as string);
    expect(after?.has(TOKEN)).toBe(false);
  });

  it('rejects a short or unknown-platform token', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/push/device')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ token: 'short', platform: 'android' })
      .expect(400);
    await request(http)
      .post('/api/push/device')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ token: TOKEN, platform: 'watch' })
      .expect(400);
  });

  it('keeps registrations isolated between users', async () => {
    const alice = await register();
    const bob = await register();
    await request(http)
      .post('/api/push/device')
      .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
      .send({ token: TOKEN, platform: 'ios' })
      .expect(201);

    const aliceMe = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
      .expect(200);
    const bobMe = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
      .expect(200);
    const store = app.get(PUSH_TOKEN_STORE) as unknown as {
      byUser: Map<string, Map<string, string>>;
    };
    expect(store.byUser.get(aliceMe.body.id as string)?.has(TOKEN)).toBe(true);
    expect(store.byUser.get(bobMe.body.id as string)?.has(TOKEN) ?? false).toBe(false);
  });
});
