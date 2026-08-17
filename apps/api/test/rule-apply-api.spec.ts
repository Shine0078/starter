/**
 * Rule dry-run and reversible bulk apply, over real HTTP.
 *
 * Two properties are load-bearing: a preview must not write, and an undo must
 * restore the exact prior category rather than a guess at it.
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
}

describe('rule applications API', () => {
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
      .send({ email: `rule-${counter}-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);

    const token: string = registered.body.tokens.accessToken;
    await request(http).post('/api/sync').set('Authorization', `Bearer ${token}`).expect(201);
    return { token };
  }

  /** A pattern the seeded mock ledger definitely contains. */
  const DRAFT = { matchType: 'contains', pattern: 'netflix', categorySlug: 'entertainment' };

  const preview = (user: Session, draft: Record<string, unknown> = DRAFT) =>
    request(http)
      .post('/api/rule-applications/preview')
      .set('Authorization', `Bearer ${user.token}`)
      .send(draft);

  it('requires a token', async () => {
    await request(http).get('/api/rule-applications').expect(401);
    await request(http).post('/api/rule-applications/preview').send(DRAFT).expect(401);
  });

  describe('preview', () => {
    it('reports the blast radius', async () => {
      const user = await signedInUser();
      const response = await preview(user).expect(200);

      expect(response.body.matched).toBeGreaterThan(0);
      expect(response.body.willChange).toBeGreaterThan(0);
      expect(response.body.sample[0]).toHaveProperty('fromCategorySlug');
      expect(response.body.sample[0].toCategorySlug).toBe('entertainment');
    });

    it('writes nothing', async () => {
      const user = await signedInUser();

      await preview(user).expect(200);

      const applications = await request(http)
        .get('/api/rule-applications')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(applications.body.count).toBe(0);

      // And the rule really did not run.
      const second = await preview(user).expect(200);
      expect(second.body.willChange).toBeGreaterThan(0);
    });

    it('flags a pattern that matches nothing', async () => {
      const user = await signedInUser();
      const response = await preview(user, { ...DRAFT, pattern: 'zzzz-no-such-merchant' }).expect(200);

      expect(response.body.matchesNothing).toBe(true);
      expect(response.body.willChange).toBe(0);
    });

    it('rejects an invalid regex and a dangerous one', async () => {
      const user = await signedInUser();
      await preview(user, { matchType: 'regex', pattern: '([unclosed', categorySlug: 'coffee' }).expect(400);
      await preview(user, { matchType: 'regex', pattern: '(a+)+$', categorySlug: 'coffee' }).expect(400);
    });

    it('rejects an unknown category', async () => {
      const user = await signedInUser();
      await preview(user, { ...DRAFT, categorySlug: 'not_a_category' }).expect(400);
    });
  });

  describe('apply and undo', () => {
    async function applied(user: Session) {
      const previewed = await preview(user).expect(200);
      const response = await request(http)
        .post('/api/rule-applications')
        .set('Authorization', `Bearer ${user.token}`)
        .send(DRAFT)
        .expect(201);

      return { applicationId: response.body.id as string, expected: previewed.body.willChange as number };
    }

    it('changes exactly what the preview promised', async () => {
      const user = await signedInUser();
      const { applicationId, expected } = await applied(user);

      const listed = await request(http)
        .get('/api/rule-applications')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(listed.body.applications[0].id).toBe(applicationId);
      expect(listed.body.applications[0].rowsChanged).toBe(expected);

      const after = await request(http)
        .get('/api/transactions?category=entertainment&limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(after.body.count).toBeGreaterThanOrEqual(expected);
    });

    it('restores the exact prior category on undo', async () => {
      const user = await signedInUser();

      const before = await request(http)
        .get('/api/transactions?category=streaming&limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const { applicationId } = await applied(user);

      const reverted = await request(http)
        .delete(`/api/rule-applications/${applicationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(reverted.body.restored).toBeGreaterThan(0);

      // Back exactly where it started, not merely "not entertainment".
      const after = await request(http)
        .get('/api/transactions?category=streaming&limit=1000')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(after.body.count).toBe(before.body.count);
    });

    it('refuses a rule that would change nothing, and explains why', async () => {
      const user = await signedInUser();
      await applied(user);

      // Everything matching is now already in the target category.
      const response = await request(http)
        .post('/api/rule-applications')
        .set('Authorization', `Bearer ${user.token}`)
        .send(DRAFT)
        .expect(400);

      expect(response.body.alreadyCorrect).toBeGreaterThan(0);
    });

    it('will not undo twice', async () => {
      const user = await signedInUser();
      const { applicationId } = await applied(user);

      await request(http)
        .delete(`/api/rule-applications/${applicationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      await request(http)
        .delete(`/api/rule-applications/${applicationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });

    it('keeps the application in history, marked reverted', async () => {
      const user = await signedInUser();
      const { applicationId } = await applied(user);

      await request(http)
        .delete(`/api/rule-applications/${applicationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const listed = await request(http)
        .get('/api/rule-applications')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(listed.body.count).toBe(1);
      expect(listed.body.applications[0].revertedAt).not.toBeNull();
    });

    it('never overrules a category the user set by hand', async () => {
      const user = await signedInUser();

      const netflix = await request(http)
        .get('/api/transactions?category=streaming&limit=1')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const victimId = netflix.body.transactions[0].id;

      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(victimId)}/category`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ categorySlug: 'gaming', createRule: false })
        .expect(200);

      const previewed = await preview(user).expect(200);
      expect(previewed.body.protectedByUserChoice).toBeGreaterThan(0);
      expect(
        previewed.body.sample.some(
          (c: { transactionId: string }) => c.transactionId === victimId,
        ),
      ).toBe(false);
    });
  });

  describe('user isolation', () => {
    it('does not show or let one user undo another application', async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();

      const created = await request(http)
        .post('/api/rule-applications')
        .set('Authorization', `Bearer ${alice.token}`)
        .send(DRAFT)
        .expect(201);

      const theirs = await request(http)
        .get('/api/rule-applications')
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(200);
      expect(theirs.body.count).toBe(0);

      await request(http)
        .delete(`/api/rule-applications/${created.body.id}`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(404);
    });
  });
});
