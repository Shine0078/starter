/**
 * Per-IP rate limiting, with the throttler genuinely enabled.
 *
 * Lives in its own file because auth-api.spec.ts disables throttling to avoid
 * unrelated 429s, and vitest gives each file its own process — so the two
 * settings cannot collide. Without this file, disabling the throttler over
 * there would mean nothing tested it at all.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
// Deliberately NOT setting THROTTLE_DISABLED.
delete process.env.THROTTLE_DISABLED;

describe('rate limiting', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['healthz'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    http = await app.getUrl().then((url) => url.replace('[::1]', '127.0.0.1'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('throttles repeated registration attempts from one address', async () => {
    // The route allows 5/minute. Spam registration is how a public signup
    // endpoint becomes someone else's mailing list.
    const statuses: number[] = [];

    for (let i = 0; i < 9; i += 1) {
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email: `throttle-${i}-${Date.now()}@example.com`, password: 'correct horse battery staple' });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
  });

  it('throttles repeated login attempts from one address', async () => {
    const statuses: number[] = [];

    for (let i = 0; i < 16; i += 1) {
      const response = await request(http)
        .post('/api/auth/login')
        .send({ email: `nobody-${i}@example.com`, password: 'correct horse battery staple' });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
  });
});
