import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import PDFDocument from 'pdfkit';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appUrlFrom, OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';
import { closePool } from '../src/infra/postgres/pool';
import { StatementImportWorker } from '../src/modules/imports/statement-import.worker';

function textPdf(lines: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 36 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.fontSize(10).text(lines.join('\n'));
    document.end();
  });
}

// Exercise the production request contract in a test process without starting
// the worker's timer; the test invokes one deterministic drain below.
process.env.STATEMENT_IMPORT_ASYNC = 'true';

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
      const created = await request(http).post('/api/imports/statements').set('Authorization', `Bearer ${token}`).send({ accountId: account.body.id, filename: 'march.csv', mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') }).expect(202);
      const importId = created.body.statement.id as string;
      expect(created.body.statement.status).toBe('queued');
      expect(created.body.rows).toEqual([]);
      await app.get(StatementImportWorker).runOnce();
      const processed = await request(http).get(`/api/imports/statements/${importId}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(processed.body.statement.status).toBe('ready');
      for (const row of processed.body.rows as Array<{ id: string; description: string }>) {
        const categorySlug = /rent/i.test(row.description) ? 'rent' : 'groceries';
        await request(http).patch(`/api/imports/statements/${importId}/rows/${row.id}`).set('Authorization', `Bearer ${token}`).send({ categorySlug, decision: 'include' }).expect(200);
      }
      const approved = await request(http).post(`/api/imports/statements/${importId}/approve`).set('Authorization', `Bearer ${token}`).expect(201);
      expect(approved.body.status).toBe('approved');
      const batch = await harness.owner.query<{ statement_import_id: string | null }>(
        'SELECT statement_import_id FROM import_batches WHERE user_id = $1 AND statement_import_id = $2',
        [createdUserId, importId],
      );
      expect(batch.rows).toHaveLength(1);
      expect(batch.rows[0]?.statement_import_id).toBe(importId);
      const details = await harness.owner.query<{ document_details: Record<string, unknown> }>(
        'SELECT document_details FROM statement_imports WHERE user_id = $1 AND id = $2',
        [createdUserId, importId],
      );
      expect(details.rows[0]?.document_details).toMatchObject({ currency: 'USD' });
      const me = await request(http).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body.id).toBe(registered.body.user.id);
      const transactions = await request(http).get('/api/transactions?limit=100').set('Authorization', `Bearer ${token}`).expect(200);
      expect(transactions.body.transactions.filter((row: { importBatchId?: string }) => row.importBatchId)).toHaveLength(2);
      const analytics = await request(http)
        .get('/api/analytics?period=custom&from=2026-03-01&to=2026-03-02&currency=USD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(analytics.body.grossExpenses).toBe(91250);
      expect(analytics.body.totalIncome).toBe(0);
      expect(analytics.body.savings).toBe(-91250);
      expect(analytics.body.spendingByCategory.map((row: { categorySlug: string }) => row.categorySlug)).toEqual(expect.arrayContaining(['groceries', 'rent']));

      const pdf = await textPdf([
        'CIBC',
        'Card number 4502 XXXX XXXX 7175',
        'Statement date: August 24, 2026',
        'Transactions from July 25 to August 24, 2026',
        'Your new charges and credits',
        'Aug 01 Aug 04 GROCERY MART 7.33',
      ]);
      const pdfImport = await request(http)
        .post('/api/imports/statements')
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: account.body.id, filename: 'cibc.pdf', mimeType: 'application/pdf', contentBase64: pdf.toString('base64') })
        .expect(202);
      await app.get(StatementImportWorker).runOnce();
      const pdfDetail = await request(http)
        .get(`/api/imports/statements/${pdfImport.body.statement.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(pdfDetail.body.statement).toMatchObject({ status: 'ready', rowsTotal: 1 });
      expect(pdfDetail.body.statement.documentDetails).toMatchObject({ issuer: 'CIBC', accountReferenceLast4: '7175', statementDate: '2026-08-24' });
      expect(pdfDetail.body.rows[0]).toMatchObject({ description: 'GROCERY MART', categorySlug: 'groceries', decision: 'include' });
      await request(http).post(`/api/imports/statements/${pdfImport.body.statement.id}/approve`).set('Authorization', `Bearer ${token}`).expect(201);

      const outflowCsv = 'Date,Description,Amount\n2026-03-03,ACME PAYROLL,-500.00';
      const outflow = await request(http)
        .post('/api/imports/statements')
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: account.body.id, filename: 'transfer-out.csv', mimeType: 'text/csv', contentBase64: Buffer.from(outflowCsv).toString('base64') })
        .expect(202);
      await app.get(StatementImportWorker).runOnce();
      await request(http).post(`/api/imports/statements/${outflow.body.statement.id}/approve`).set('Authorization', `Bearer ${token}`).expect(201);

      const savings = await request(http)
        .post('/api/accounts/manual')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Statement savings', type: 'savings', currency: 'USD', balanceCurrent: 0 })
        .expect(201);
      const inflowCsv = 'Date,Description,Amount\n2026-03-03,ACME PAYROLL,500.00';
      const inflow = await request(http)
        .post('/api/imports/statements')
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: savings.body.id, filename: 'transfer-in.csv', mimeType: 'text/csv', contentBase64: Buffer.from(inflowCsv).toString('base64') })
        .expect(202);
      await app.get(StatementImportWorker).runOnce();
      await request(http).post(`/api/imports/statements/${inflow.body.statement.id}/approve`).set('Authorization', `Bearer ${token}`).expect(201);

      const paired = await request(http).get('/api/transactions?limit=100').set('Authorization', `Bearer ${token}`).expect(200);
      const matched = paired.body.transactions.filter((row: { rawDescriptor: string }) => row.rawDescriptor === 'ACME PAYROLL');
      expect(matched).toHaveLength(2);
      expect(matched.every((row: { categorySlug: string; categorySource: string }) => row.categorySlug === 'transfer' && row.categorySource === 'transfer_pairing')).toBe(true);
    });
  });
}
