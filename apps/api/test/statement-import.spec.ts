import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

describe('manual statement imports', () => {
  let app: INestApplication;
  let http: string;
  let sequence = 0;

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

  afterAll(async () => { await app?.close(); });

  async function user() {
    sequence += 1;
    const registered = await request(http).post('/api/auth/register').send({ email: `statement-${sequence}-${Date.now()}@example.com`, password: 'correct horse battery staple' }).expect(201);
    const token = registered.body.tokens.accessToken as string;
    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);
    const accounts = await request(http).get('/api/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return { token, accountId: accounts.body[0].id as string };
  }

  const csv = [
    'Date,Description,Amount',
    '2026-03-01,GROCERY MART,-52.10',
    '2026-03-02,RENT PAYMENT,-1200.00',
    '2026-03-03,ACME PAYROLL,2000.00',
  ].join('\n');

  it('requires authentication and creates a reviewable encrypted statement', async () => {
    await request(http).post('/api/imports/statements').send({}).expect(401);
    const signedIn = await user();
    const response = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${signedIn.token}`).send({ accountId: signedIn.accountId, filename: 'march.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(201);
    expect(response.body.statement.status).toBe('ready');
    expect(response.body.statement.rowsTotal).toBe(3);
    expect(response.body.rows).toHaveLength(3);
    expect(response.body.statement).not.toHaveProperty('encryptedSource');
    expect(response.body.rows.some((row: { decision: string }) => row.decision === 'needs_review')).toBe(true);
    const summary = await request(http).get(`/api/imports/statements/${response.body.statement.id}/summary`).set('Authorization', `Bearer ${signedIn.token}`).expect(200);
    expect(summary.body.currency).toBe('USD');
    expect(summary.body.categoryTotals).toEqual(expect.any(Array));
  });

  it('does not block approval just because a recognized merchant is recurring', async () => {
    const signedIn = await user();
    const recurringCsv = [
      'Date,Description,Amount',
      '2026-03-01,APPLE.COM/BILL,-7.33',
      '2026-04-01,APPLE.COM/BILL,-7.33',
    ].join('\n');
    const response = await request(http)
      .post('/api/imports/statements')
      .set('Authorization', `Bearer ${signedIn.token}`)
      .send({ accountId: signedIn.accountId, filename: 'recurring.csv', mimeType: 'text/csv', contentBase64: Buffer.from(recurringCsv).toString('base64') })
      .expect(201);

    expect(response.body.statement.rowsNeedsReview).toBe(0);
    expect(response.body.rows.every((row: { flags: string[]; decision: string }) => row.flags.includes('recurring_payment') && row.decision === 'include')).toBe(true);
  });

  it('supports edit, split, merge, approval, and duplicate identity protection', async () => {
    const signedIn = await user();
    const created = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${signedIn.token}`).send({ accountId: signedIn.accountId, filename: 'march.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(201);
    const id = created.body.statement.id as string;
    const rows = created.body.rows as Array<{ id: string; amount: number | null }>;
    for (const row of rows) {
      await request(http).patch(`/api/imports/statements/${id}/rows/${row.id}`).set('Authorization', `Bearer ${signedIn.token}`).send({ categorySlug: 'unknown', decision: 'include' }).expect(200);
    }
    const split = await request(http).post(`/api/imports/statements/${id}/rows/${rows[0]!.id}/split`).set('Authorization', `Bearer ${signedIn.token}`).send({ parts: [{ amount: -3000, categorySlug: 'groceries' }, { amount: -2210, categorySlug: 'shopping' }] }).expect(201);
    expect(split.body).toHaveLength(2);
    const current = await request(http).get(`/api/imports/statements/${id}`).set('Authorization', `Bearer ${signedIn.token}`).expect(200);
    const splitRows = current.body.rows as Array<{ id: string }>;
    await request(http).post(`/api/imports/statements/${id}/rows/merge`).set('Authorization', `Bearer ${signedIn.token}`).send({ rowIds: [splitRows[0]!.id, splitRows[1]!.id] }).expect(201);
    const finalRows = (await request(http).get(`/api/imports/statements/${id}`).set('Authorization', `Bearer ${signedIn.token}`).expect(200)).body.rows as Array<{ id: string; decision: string }>;
    for (const row of finalRows) {
      if (row.decision === 'needs_review') await request(http).patch(`/api/imports/statements/${id}/rows/${row.id}`).set('Authorization', `Bearer ${signedIn.token}`).send({ decision: 'exclude' }).expect(200);
    }
    const approved = await request(http).post(`/api/imports/statements/${id}/approve`).set('Authorization', `Bearer ${signedIn.token}`).expect(201);
    expect(approved.body.status).toBe('approved');
    const txns = await request(http).get('/api/transactions?limit=1000').set('Authorization', `Bearer ${signedIn.token}`).expect(200);
    expect(txns.body.transactions.some((txn: { importBatchId?: string }) => txn.importBatchId)).toBe(true);
    await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${signedIn.token}`).send({ accountId: signedIn.accountId, filename: 'march-copy.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(409);
    await request(http).delete(`/api/imports/statements/${id}`).set('Authorization', `Bearer ${signedIn.token}`).expect(204);
    const reimported = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${signedIn.token}`).send({ accountId: signedIn.accountId, filename: 'march-retry.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(201);
    for (const row of reimported.body.rows as Array<{ id: string }>) {
      await request(http).patch(`/api/imports/statements/${reimported.body.statement.id}/rows/${row.id}`).set('Authorization', `Bearer ${signedIn.token}`).send({ categorySlug: 'unknown', decision: 'include' }).expect(200);
    }
    await request(http).post(`/api/imports/statements/${reimported.body.statement.id}/approve`).set('Authorization', `Bearer ${signedIn.token}`).expect(409);
    const audit = await request(http).get(`/api/imports/statements/${id}/audit`).set('Authorization', `Bearer ${signedIn.token}`).expect(200);
    expect(audit.body.some((event: { kind: string }) => event.kind === 'approved')).toBe(true);
  });

  it('does not allow cross-user reads or source deletion to erase approved rows', async () => {
    const first = await user();
    const second = await user();
    const created = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${first.token}`).send({ accountId: first.accountId, filename: 'private.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(201);
    const id = created.body.statement.id as string;
    await request(http).get(`/api/imports/statements/${id}`).set('Authorization', `Bearer ${second.token}`).expect(404);
    await request(http).delete(`/api/imports/statements/${id}/source`).set('Authorization', `Bearer ${first.token}`).expect(204);
    const after = await request(http).get(`/api/imports/statements/${id}`).set('Authorization', `Bearer ${first.token}`).expect(200);
    expect(after.body.statement.sourceDeletedAt).toBeTruthy();
    expect(after.body.rows).toHaveLength(3);
  });
});
