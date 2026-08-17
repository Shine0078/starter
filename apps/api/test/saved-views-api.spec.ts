/**
 * Saved views and the report over them, end to end.
 *
 * Two properties carry the design: applying a view must go through the same
 * query path as the live transaction list, and a chart must always ship with
 * the numbers behind it.
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

describe('saved views API', () => {
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

  let counter = 0;

  async function signedInUser(): Promise<string> {
    counter += 1;
    const registered = await request(http)
      .post('/api/auth/register')
      .send({ email: `view-${counter}-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);

    const token: string = registered.body.tokens.accessToken;
    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);
    return token;
  }

  const create = (token: string, body: Record<string, unknown>) =>
    request(http)
      .post('/api/transaction-views')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('requires a token', async () => {
    await request(http).get('/api/transaction-views').expect(401);
  });

  describe('creating', () => {
    it('stores a named filter', async () => {
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Coffee',
        filter: { categorySlug: 'coffee' },
      }).expect(201);

      expect(created.body.name).toBe('Coffee');
      expect(created.body.filter).toEqual({ categorySlug: 'coffee' });
    });

    it('refuses a view that constrains nothing', async () => {
      // It would just be the transaction list under a different name.
      const token = await signedInUser();
      await create(token, { name: 'Everything', filter: {} }).expect(400);
    });

    it('refuses a duplicate name, case-insensitively', async () => {
      const token = await signedInUser();
      await create(token, { name: 'Coffee', filter: { categorySlug: 'coffee' } }).expect(201);
      await create(token, { name: 'coffee', filter: { categorySlug: 'coffee' } }).expect(409);
    });

    it('reports name and filter problems together', async () => {
      const token = await signedInUser();
      const response = await create(token, {
        name: '',
        filter: { dateFrom: '2026-08-31', dateTo: '2026-08-01', amountMin: -5 },
      }).expect(400);

      expect(response.body.problems.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('applying', () => {
    it('returns the same rows as the equivalent live query', async () => {
      // The whole design: one filtering implementation, so a saved view and a
      // hand-built filter cannot disagree about the same criteria.
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Streaming',
        filter: { categorySlug: 'streaming' },
      }).expect(201);

      const viaView = await request(http)
        .get(`/api/transaction-views/${created.body.id}/transactions?limit=1000`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const viaQuery = await request(http)
        .get('/api/transactions?category=streaming&limit=1000')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(viaView.body.count).toBe(viaQuery.body.count);
      expect(viaView.body.count).toBeGreaterThan(0);
    });

    it('404s on another user view id', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await create(alice, {
        name: 'Coffee',
        filter: { categorySlug: 'coffee' },
      }).expect(201);

      await request(http)
        .get(`/api/transaction-views/${created.body.id}/transactions`)
        .set('Authorization', `Bearer ${bob}`)
        .expect(404);
    });
  });

  describe('report', () => {
    it('pairs the chart with a table and a spoken summary', async () => {
      // A pie chart is unreadable to a screen reader and unusable to anyone who
      // wants to check a total, so both ship with it.
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Food',
        filter: { categoryKind: 'expense' },
      }).expect(201);

      const report = await request(http)
        .get(`/api/transaction-views/${created.body.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(report.body.view.name).toBe('Food');
      expect(Array.isArray(report.body.byCategory)).toBe(true);
      expect(report.body.table.length).toBe(report.body.byCategory.length);
      expect(typeof report.body.spokenSummary).toBe('string');
      expect(report.body.spokenSummary.length).toBeGreaterThan(0);
    });

    it('keeps chart and table in agreement', async () => {
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Expenses',
        filter: { categoryKind: 'expense' },
      }).expect(201);

      const report = await request(http)
        .get(`/api/transaction-views/${created.body.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      for (const [index, point] of report.body.byCategory.entries()) {
        expect(report.body.table[index].category).toBe(point.label);
      }
    });

    it('does not divide by zero on an empty period', async () => {
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Ancient history',
        filter: { dateFrom: '1990-01-01', dateTo: '1990-12-31' },
      }).expect(201);

      const report = await request(http)
        .get(`/api/transaction-views/${created.body.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(report.body.transactionCount).toBe(0);
      expect(report.body.spokenSummary).toMatch(/no transactions/i);
      for (const point of report.body.byCategory) {
        expect(Number.isFinite(point.percent)).toBe(true);
      }
    });

    it('404s on another user view', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await create(alice, {
        name: 'Coffee',
        filter: { categorySlug: 'coffee' },
      }).expect(201);

      await request(http)
        .get(`/api/transaction-views/${created.body.id}/report`)
        .set('Authorization', `Bearer ${bob}`)
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('removes and frees the name', async () => {
      const token = await signedInUser();
      const created = await create(token, {
        name: 'Coffee',
        filter: { categorySlug: 'coffee' },
      }).expect(201);

      await request(http)
        .delete(`/api/transaction-views/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await create(token, { name: 'Coffee', filter: { categorySlug: 'coffee' } }).expect(201);
    });

    it('will not let one user delete another view', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await create(alice, {
        name: 'Coffee',
        filter: { categorySlug: 'coffee' },
      }).expect(201);

      await request(http)
        .delete(`/api/transaction-views/${created.body.id}`)
        .set('Authorization', `Bearer ${bob}`)
        .expect(404);

      const mine = await request(http)
        .get('/api/transaction-views')
        .set('Authorization', `Bearer ${alice}`)
        .expect(200);
      expect(mine.body.count).toBe(1);
    });
  });
});
