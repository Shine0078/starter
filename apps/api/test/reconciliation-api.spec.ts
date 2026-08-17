/**
 * Reconciliation over real HTTP, through the deployed request path.
 *
 * The isolation cases matter most: a balance assertion names an account and a
 * date, both of which are guessable, so the boundary has to be the session
 * rather than the identifier.
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

interface Session {
  token: string;
  accountId: string;
}

describe('reconciliation API', () => {
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

  /** A registered user with a synced ledger, so there are balances to check. */
  async function signedInUser(): Promise<Session> {
    counter += 1;
    const registered = await request(http)
      .post('/api/auth/register')
      .send({ email: `rec-${counter}-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);

    const token: string = registered.body.tokens.accessToken;

    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);

    const accounts = await request(http)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return { token, accountId: accounts.body[0].id };
  }

  describe('authorization', () => {
    it('requires a token on every route', async () => {
      await request(http).get('/api/reconciliations').expect(401);
      await request(http).get('/api/reconciliations/summary').expect(401);
      await request(http).post('/api/reconciliations').send({}).expect(401);
    });
  });

  describe('preview', () => {
    it('derives a balance without recording anything', async () => {
      const user = await signedInUser();

      const preview = await request(http)
        .get('/api/reconciliations/preview')
        .query({ account: user.accountId, statementDate: '2026-07-31', observedBalance: 1 })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(preview.body).toHaveProperty('computedBalance');
      expect(preview.body).toHaveProperty('explanation');

      // A preview that quietly wrote a row would fill the audit trail with
      // speculation while still looking complete.
      const listed = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(listed.body.count).toBe(0);
    });

    it('refuses an account the caller does not own', async () => {
      const user = await signedInUser();

      // Deliberately a fabricated id rather than another user's. The mock
      // aggregator seeds every user with the same account ids, so passing
      // Alice's id as Bob would resolve to *Bob's own* identically-named
      // account and prove nothing. The isolation that matters is asserted
      // below, on the rows rather than on the identifier.
      await request(http)
        .get('/api/reconciliations/preview')
        .query({ account: 'acc_not_yours', statementDate: '2026-07-31', observedBalance: 1 })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });
  });

  describe('recording an assertion', () => {
    it('stores the observation, the derived balance, and the difference', async () => {
      const user = await signedInUser();

      const preview = await request(http)
        .get('/api/reconciliations/preview')
        .query({ account: user.accountId, statementDate: '2026-07-31', observedBalance: 0 })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const computed: number = preview.body.computedBalance;

      const created = await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accountId,
          statementDate: '2026-07-31',
          observedBalance: computed,
          source: 'statement',
        })
        .expect(201);

      expect(created.body.status).toBe('balanced');
      expect(created.body.difference).toBe(0);
      expect(created.body.computedBalance).toBe(computed);
      expect(created.body.differenceFormatted).toBeTruthy();
    });

    it('records a real difference rather than adjusting anything', async () => {
      const user = await signedInUser();

      const before = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const created = await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '2026-07-31', observedBalance: 12_345 })
        .expect(201);

      expect(created.body.status).toBe('unbalanced');
      expect(created.body.difference).not.toBe(0);

      // The ledger is untouched. An app that inserts a balancing entry destroys
      // the discrepancy the user needed to investigate.
      const after = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(after.body.count).toBe(before.body.count);
    });

    it('rejects a future statement date', async () => {
      const user = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '2099-01-01', observedBalance: 0 })
        .expect(400);
    });

    it('rejects a malformed date and a fractional amount', async () => {
      const user = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '31/07/2026', observedBalance: 0 })
        .expect(400);

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '2026-07-31', observedBalance: 10.5 })
        .expect(400);
    });

    it('rejects an unknown source', async () => {
      const user = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          accountId: user.accountId,
          statementDate: '2026-07-31',
          observedBalance: 0,
          source: 'vibes',
        })
        .expect(400);
    });

    it('supersedes an earlier assertion for the same closing date', async () => {
      const user = await signedInUser();

      for (const observedBalance of [111, 222]) {
        await request(http)
          .post('/api/reconciliations')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ accountId: user.accountId, statementDate: '2026-07-31', observedBalance })
          .expect(201);
      }

      const listed = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const live = listed.body.reconciliations.filter(
        (r: { archivedAt: string | null }) => r.archivedAt === null,
      );

      expect(listed.body.count).toBe(2);
      expect(live).toHaveLength(1);
      expect(live[0].observedBalance).toBe(222);
    });
  });

  describe('summary', () => {
    it('marks a never-reconciled account as overdue', async () => {
      const user = await signedInUser();

      const summary = await request(http)
        .get('/api/reconciliations/summary')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(summary.body.count).toBeGreaterThan(0);
      expect(summary.body.overdue).toBe(summary.body.count);
      expect(summary.body.accounts[0].lastStatementDate).toBeNull();
      expect(summary.body.accounts[0].daysSinceReconciled).toBeNull();
    });
  });

  describe('withdrawing', () => {
    it('archives instead of deleting', async () => {
      const user = await signedInUser();

      const created = await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '2026-07-31', observedBalance: 5 })
        .expect(201);

      await request(http)
        .delete(`/api/reconciliations/${created.body.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(204);

      const listed = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(listed.body.count).toBe(1);
      expect(listed.body.reconciliations[0].archivedAt).not.toBeNull();
    });

    it('will not archive twice', async () => {
      const user = await signedInUser();

      const created = await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: user.accountId, statementDate: '2026-07-31', observedBalance: 5 })
        .expect(201);

      await request(http)
        .delete(`/api/reconciliations/${created.body.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(204);

      await request(http)
        .delete(`/api/reconciliations/${created.body.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });
  });

  describe('user isolation', () => {
    it('does not show one user assertions to another', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ accountId: alice.accountId, statementDate: '2026-07-31', observedBalance: 5 })
        .expect(201);

      const bobList = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(200);

      expect(bobList.body.count).toBe(0);
    });

    it('will not let one user withdraw another assertion', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ accountId: alice.accountId, statementDate: '2026-07-31', observedBalance: 5 })
        .expect(201);

      await request(http)
        .delete(`/api/reconciliations/${created.body.id}`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(404);

      // Still live for its owner.
      const aliceList = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(aliceList.body.reconciliations[0].archivedAt).toBeNull();
    });

    it('scopes a write to the caller even when the account id is shared', async () => {
      // Every seeded user gets the same account ids, so an id alone is not a
      // secret and cannot be the boundary. What must hold is that Bob's write
      // resolves against Bob's account and never appears in Alice's history.
      const alice = await signedInUser();
      const bob = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ accountId: alice.accountId, statementDate: '2026-07-31', observedBalance: 5 })
        .expect(201);

      const aliceList = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(aliceList.body.count).toBe(0);

      const bobList = await request(http)
        .get('/api/reconciliations')
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(200);

      expect(bobList.body.count).toBe(1);
    });

    it('refuses an account id nobody owns', async () => {
      const user = await signedInUser();

      await request(http)
        .post('/api/reconciliations')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ accountId: 'acc_not_yours', statementDate: '2026-07-31', observedBalance: 5 })
        .expect(404);
    });
  });
});
