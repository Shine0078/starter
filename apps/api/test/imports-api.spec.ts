/**
 * Staged import over real HTTP.
 *
 * The property that matters most is the last one: reverting an import must
 * remove only the rows that import created, never a transaction the provider
 * supplied. Getting that wrong deletes real bank data on an undo.
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

const CSV = [
  'Date,Description,Amount',
  '2026-03-01,COFFEE SHOP DOWNTOWN,-4.50',
  '2026-03-02,GROCERY MART 118,-52.10',
  '2026-03-03,ACME PAYROLL,2000.00',
].join('\n');

interface Session {
  token: string;
  accountId: string;
}

describe('imports API', () => {
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

  async function signedInUser(): Promise<Session> {
    counter += 1;
    const registered = await request(http)
      .post('/api/auth/register')
      .send({ email: `imp-${counter}-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);

    const token: string = registered.body.tokens.accessToken;
    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);

    const accounts = await request(http)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return { token, accountId: accounts.body[0].id };
  }

  const preview = (user: Session, content = CSV, mapping?: unknown) =>
    request(http)
      .post('/api/imports/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ accountId: user.accountId, filename: 'statement.csv', content, mapping });

  it('requires a token', async () => {
    await request(http).get('/api/imports').expect(401);
    await request(http).post('/api/imports/preview').send({}).expect(401);
  });

  describe('preview', () => {
    it('infers a mapping and classifies every row', async () => {
      const user = await signedInUser();
      const response = await preview(user).expect(200);

      expect(response.body.mapping.date).toBe('Date');
      expect(response.body.mapping.convention).toBe('signed');
      expect(response.body.review.summary.total).toBe(3);
      expect(response.body.review.summary.importable).toBe(3);
    });

    it('writes nothing', async () => {
      const user = await signedInUser();

      const before = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      await preview(user).expect(200);

      const after = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(after.body.count).toBe(before.body.count);
      expect((await request(http).get('/api/imports').set('Authorization', `Bearer ${user.token}`)).body.count).toBe(0);
    });

    it('returns headers instead of failing when no mapping can be inferred', async () => {
      const user = await signedInUser();
      const response = await preview(user, 'Foo,Bar\n1,2').expect(200);

      expect(response.body.mapping).toBeNull();
      expect(response.body.headers).toEqual(['Foo', 'Bar']);
      expect(response.body.warnings.length).toBeGreaterThan(0);
    });

    it('reports unreadable rows rather than dropping them', async () => {
      const user = await signedInUser();
      const csv = 'Date,Description,Amount\n2026-03-01,Coffee,-4.50\nnot-a-date,Broken,-1.00';
      const response = await preview(user, csv).expect(200);

      expect(response.body.review.summary.total).toBe(2);
      expect(response.body.review.summary.invalid).toBe(1);
      expect(response.body.review.rows[1].reason).toMatch(/date/i);
    });

    it('rejects an account the caller does not own', async () => {
      const user = await signedInUser();
      await request(http)
        .post('/api/imports/preview')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: 'acc_not_yours', filename: 'x.csv', content: CSV })
        .expect(404);
    });
  });

  describe('commit', () => {
    it('imports the rows and records the batch', async () => {
      const user = await signedInUser();
      const previewed = await preview(user).expect(200);

      const committed = await request(http)
        .post('/api/imports/commit')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accountId,
          filename: 'statement.csv',
          content: CSV,
          mapping: previewed.body.mapping,
        })
        .expect(201);

      expect(committed.body.rowsImported).toBe(3);
      expect(committed.body.status).toBe('committed');

      // Listed rather than searched: `search` goes through the natural-language
      // interpreter, and this test is about what the import wrote, not about
      // how a phrase is parsed.
      const listed = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const imported = listed.body.transactions.filter(
        (t: { importBatchId?: string }) => t.importBatchId === committed.body.id,
      );

      expect(imported).toHaveLength(3);
      expect(
        imported.some((t: { rawDescriptor: string }) =>
          t.rawDescriptor.includes('COFFEE SHOP DOWNTOWN'),
        ),
      ).toBe(true);
    });

    it('treats a second import of the same file as duplicates', async () => {
      const user = await signedInUser();
      const previewed = await preview(user).expect(200);
      const body = {
        accountId: user.accountId,
        filename: 'statement.csv',
        content: CSV,
        mapping: previewed.body.mapping,
      };

      await request(http)
        .post('/api/imports/commit')
        .set('Authorization', `Bearer ${user.token}`)
        .send(body)
        .expect(201);

      // The rows are now in the ledger, so the same file reviews as duplicates.
      const second = await preview(user).expect(200);
      expect(second.body.review.summary.duplicates).toBe(3);
      expect(second.body.review.summary.importable).toBe(0);
    });

    it('refuses a file with nothing importable', async () => {
      const user = await signedInUser();
      const csv = 'Date,Description,Amount\nnot-a-date,Broken,-1.00';
      const previewed = await preview(user, csv).expect(200);

      await request(http)
        .post('/api/imports/commit')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accountId,
          filename: 'bad.csv',
          content: csv,
          mapping: previewed.body.mapping,
        })
        .expect(400);
    });
  });

  describe('revert', () => {
    async function importedUser(): Promise<{ user: Session; batchId: string; before: number }> {
      const user = await signedInUser();

      const before = (
        await request(http)
          .get('/api/transactions?limit=1000')
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200)
      ).body.count as number;

      const previewed = await preview(user).expect(200);
      const committed = await request(http)
        .post('/api/imports/commit')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accountId,
          filename: 'statement.csv',
          content: CSV,
          mapping: previewed.body.mapping,
        })
        .expect(201);

      return { user, batchId: committed.body.id, before };
    }

    it('removes exactly the rows the import created', async () => {
      // The property that makes an import safe to try: undoing it must leave
      // provider-synced transactions untouched.
      const { user, batchId, before } = await importedUser();

      const afterImport = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(afterImport.body.count).toBe(before + 3);

      const reverted = await request(http)
        .delete(`/api/imports/${batchId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(reverted.body.removed).toBe(3);

      const afterRevert = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(afterRevert.body.count).toBe(before);
    });

    it('keeps the batch in history, marked reverted', async () => {
      const { user, batchId } = await importedUser();

      await request(http)
        .delete(`/api/imports/${batchId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const history = await request(http)
        .get('/api/imports')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(history.body.count).toBe(1);
      expect(history.body.imports[0].status).toBe('reverted');
      expect(history.body.imports[0].revertedAt).not.toBeNull();
    });

    it('will not revert twice', async () => {
      const { user, batchId } = await importedUser();

      await request(http)
        .delete(`/api/imports/${batchId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      await request(http)
        .delete(`/api/imports/${batchId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });

    it('will not let one user revert another import', async () => {
      const { batchId } = await importedUser();
      const other = await signedInUser();

      await request(http)
        .delete(`/api/imports/${batchId}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);
    });

    it('does not show one user imports to another', async () => {
      const { user } = await importedUser();
      const other = await signedInUser();

      const theirs = await request(http)
        .get('/api/imports')
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);

      expect(theirs.body.count).toBe(0);

      const mine = await request(http)
        .get('/api/imports')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(mine.body.count).toBe(1);
    });
  });
});
