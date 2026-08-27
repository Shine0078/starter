import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appUrlFrom, OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';
import { closePool } from '../src/infra/postgres/pool';

if (!OWNER_URL) {
  describe('manual statement import API on PostgreSQL', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
} else {
  const ownerUrl = OWNER_URL;
  describe('manual statement import API on PostgreSQL', () => {
    let harness: PgHarness;
    let app: INestApplication;
    let http: string;
    let createdUserId: string | undefined;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
      process.env.STORE = 'postgres';
      process.env.DATABASE_URL = ownerUrl;
      process.env.DATABASE_APP_URL = appUrlFrom(ownerUrl);
      process.env.MIGRATE_ON_BOOT = 'false';
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'postgres-statement-test-secret-at-least-32-chars';
      process.env.THROTTLE_DISABLED = 'true';
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
      if (createdUserId) await harness.owner.query('DELETE FROM users WHERE id = $1', [createdUserId]);
      await app?.close();
      await harness.close();
      await closePool();
    });

    it('runs upload, restricted-role persistence, approval, and /auth/me end to end', async () => {
      const registered = await request(http).post('/api/auth/register').send({ email: `statement-db-${Date.now()}@example.com`, password: 'correct horse battery staple' }).expect(201);
      createdUserId = registered.body.user.id as string;
      const token = registered.body.tokens.accessToken as string;
      const account = await request(http).post('/api/accounts/manual').set('Authorization', `Bearer ${token}`).send({ name: 'Statement account', type: 'checking', currency: 'USD', balanceCurrent: 0 }).expect(201);
      const csv = 'Date,Description,Amount\n2026-03-01,GROCERY MART,-12.50\n2026-03-02,RENT PAYMENT,-900.00';
      const created = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${token}`).send({ accountId: account.body.id, filename: 'march.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(201);
      const importId = created.body.statement.id as string;
      for (const row of created.body.rows as Array<{ id: string }>) {
        await request(http).patch(`/api/imports/statements/${importId}/rows/${row.id}`).set('Authorization', `Bearer ${token}`).send({ categorySlug: 'groceries', decision: 'include' }).expect(200);
      }
      const approved = await request(http).post(`/api/imports/statements/${importId}/approve`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(approved.body.status).toBe('approved');
      const me = await request(http).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body.id).toBe(registered.body.user.id);
      const transactions = await request(http).get('/api/transactions?limit=100').set('Authorization', `Bearer ${token}`).expect(200);
      expect(transactions.body.transactions.filter((row: { importBatchId?: string }) => row.importBatchId)).toHaveLength(2);
    });
  });
}
