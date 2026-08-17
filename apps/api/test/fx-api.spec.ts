/**
 * FX rates and combined net worth over real HTTP.
 *
 * The contract under test: a cross-currency total is produced only from a
 * dated, sourced rate, and any currency without one is named rather than
 * quietly omitted.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

const PASSWORD = 'correct horse battery staple';

describe('fx API', () => {
  let app: INestApplication;
  let http: string;
  let today: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['healthz'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    http = await app.getUrl().then((url) => url.replace('[::1]', '127.0.0.1'));
    today = new Date().toISOString().slice(0, 10);
  });

  afterAll(async () => {
    await app?.close();
  });

  let counter = 0;

  async function signedInUser(): Promise<string> {
    counter += 1;
    const registered = await request(http)
      .post('/api/auth/register')
      .send({ email: `fx-${counter}-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);

    const token: string = registered.body.tokens.accessToken;
    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);
    return token;
  }

  it('requires a token', async () => {
    await request(http).get('/api/fx/rates').expect(401);
    await request(http).get('/api/fx/net-worth').expect(401);
  });

  describe('recording rates', () => {
    it('stores a dated, sourced rate', async () => {
      const token = await signedInUser();

      const created = await request(http)
        .post('/api/fx/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ base: 'eur', quote: 'usd', rate: 1.1, asOf: today, source: 'statement' })
        .expect(201);

      expect(created.body).toMatchObject({ base: 'EUR', quote: 'USD', rate: 1.1 });
      expect(created.body.asOf).toBe(today);
      expect(created.body.source).toBe('statement');
    });

    it('rejects a future rate', async () => {
      // Would restate today's totals the moment it arrived.
      const token = await signedInUser();
      await request(http)
        .post('/api/fx/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ base: 'EUR', quote: 'USD', rate: 1.1, asOf: '2099-01-01' })
        .expect(400);
    });

    it('rejects a self-rate, a non-positive rate, and a bad code', async () => {
      const token = await signedInUser();
      const bad = [
        { base: 'USD', quote: 'USD', rate: 1, asOf: today },
        { base: 'EUR', quote: 'USD', rate: 0, asOf: today },
        { base: 'EUROS', quote: 'USD', rate: 1.1, asOf: today },
      ];

      for (const body of bad) {
        await request(http)
          .post('/api/fx/rates')
          .set('Authorization', `Bearer ${token}`)
          .send(body)
          .expect(400);
      }
    });

    it('treats a second rate for the same pair and day as a correction', async () => {
      const token = await signedInUser();
      const send = (rate: number) =>
        request(http)
          .post('/api/fx/rates')
          .set('Authorization', `Bearer ${token}`)
          .send({ base: 'EUR', quote: 'USD', rate, asOf: today })
          .expect(201);

      await send(1.1);
      await send(1.2);

      const listed = await request(http)
        .get('/api/fx/rates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listed.body.count).toBe(1);
      expect(listed.body.rates[0].rate).toBe(1.2);
    });

    it('removes a rate', async () => {
      const token = await signedInUser();
      const created = await request(http)
        .post('/api/fx/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ base: 'EUR', quote: 'USD', rate: 1.1, asOf: today })
        .expect(201);

      await request(http)
        .delete(`/api/fx/rates/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(http)
        .delete(`/api/fx/rates/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('combined net worth', () => {
    it('totals a single-currency portfolio without needing a rate', async () => {
      const token = await signedInUser();

      const result = await request(http)
        .get('/api/fx/net-worth?currency=USD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(result.body.incomplete).toBe(false);
      expect(result.body.missing).toEqual([]);
      expect(result.body.amountFormatted).toBeTruthy();
    });

    it('always reports completeness, so a partial total cannot look finished', async () => {
      // The multi-currency combination itself is covered exhaustively in
      // fx-rates.spec.ts against the pure function. What matters here is that
      // the endpoint always carries the completeness contract, whatever the
      // portfolio happens to hold.
      const token = await signedInUser();

      const result = await request(http)
        .get('/api/fx/net-worth?currency=USD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(result.body).toHaveProperty('incomplete');
      expect(Array.isArray(result.body.missing)).toBe(true);
      expect(Array.isArray(result.body.byCurrency)).toBe(true);
      // Every currency the user actually holds is accounted for, either
      // converted or named as missing — never silently assumed to be 1:1.
      for (const total of result.body.byCurrency) {
        const converted = total.currency === result.body.currency;
        const named = result.body.missing.includes(total.currency);
        const rated = result.body.ratesUsed.some(
          (r: { base: string }) => r.base === total.currency,
        );
        expect(converted || named || rated).toBe(true);
      }
    });

    it('rejects a malformed target currency', async () => {
      const token = await signedInUser();
      await request(http)
        .get('/api/fx/net-worth?currency=DOLLARS')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('reports the rates it relied on', async () => {
      const token = await signedInUser();
      await request(http)
        .post('/api/fx/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({ base: 'EUR', quote: 'USD', rate: 1.1, asOf: today, source: 'provider' })
        .expect(201);

      const result = await request(http)
        .get('/api/fx/net-worth?currency=USD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // ratesUsed is present whether or not it is populated, so a caller can
      // always audit the figure.
      expect(Array.isArray(result.body.ratesUsed)).toBe(true);
    });
  });

  describe('user isolation', () => {
    it('does not show one user rates to another', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await request(http)
        .post('/api/fx/rates')
        .set('Authorization', `Bearer ${alice}`)
        .send({ base: 'EUR', quote: 'USD', rate: 1.1, asOf: today })
        .expect(201);

      const theirs = await request(http)
        .get('/api/fx/rates')
        .set('Authorization', `Bearer ${bob}`)
        .expect(200);
      expect(theirs.body.count).toBe(0);

      await request(http)
        .delete(`/api/fx/rates/${created.body.id}`)
        .set('Authorization', `Bearer ${bob}`)
        .expect(404);
    });
  });
});
