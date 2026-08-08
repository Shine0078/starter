/**
 * End-to-end authentication and authorization over real HTTP.
 *
 * Boots the actual module graph — global guards, validation pipe, controllers —
 * so what is exercised is the deployed request path rather than a hand-wired
 * approximation of it. The isolation tests here are the ones that matter most:
 * before this work, every route trusted an `x-user-id` header, so reading
 * someone else's finances took one line of curl.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_STORE, TRANSACTION_STORE, type AccountStore, type TransactionStore } from '../src/ports';
import { ACCOUNT_DELETION_STORE, type AccountDeletionStore } from '../src/ports/auth';
import { EMAIL_SENDER } from '../src/ports/auth';
import type { DevelopmentEmailSender } from '../src/infra/auth/auth-action-stores';

// Must be set before anything calls loadConfig(), which memoises.
process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.LEGAL_TERMS_VERSION = 'terms-test-v1';
process.env.LEGAL_TERMS_URL = 'https://finverse.example/legal/terms-test-v1';
process.env.LEGAL_PRIVACY_VERSION = 'privacy-test-v1';
process.env.LEGAL_PRIVACY_URL = 'https://finverse.example/legal/privacy-test-v1';
// This suite drives hundreds of requests from one address. Per-IP throttling is
// real and is exercised in auth-throttle.spec.ts; here it would only produce
// 429s unrelated to what each test is checking. Account lockout — the control
// that actually stops credential stuffing — stays on and is asserted below.
process.env.THROTTLE_DISABLED = 'true';

const PASSWORD = 'correct horse battery staple';
const LEGAL_ACCEPTANCE = {
  acceptedTerms: true,
  termsVersion: 'terms-test-v1',
  acceptedPrivacyNotice: true,
  privacyVersion: 'privacy-test-v1',
};

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('auth API', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    // Imported here rather than at module scope so the environment above is
    // already set when config is first read — loadConfig memoises.
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
  const freshEmail = (): string => `user${(counter += 1)}-${Date.now()}@example.com`;

  async function register(
    email = freshEmail(),
  ): Promise<{ email: string; userId: string; tokens: Tokens }> {
    const response = await request(http)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, ...LEGAL_ACCEPTANCE })
      .expect(201);

    return { email, userId: response.body.user.id, tokens: response.body.tokens };
  }

  // ------------------------------------------------------------- register

  describe('registration', () => {
    it('creates an account and returns a session', async () => {
      const email = freshEmail();
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD, ...LEGAL_ACCEPTANCE })
        .expect(201);

      expect(response.body.user.email).toBe(email);
      expect(response.body.tokens.accessToken).toBeTruthy();
      expect(response.body.tokens.refreshToken).toBeTruthy();
      expect(response.body.tokens.tokenType).toBe('Bearer');
    });

    it('never returns the password hash', async () => {
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email: freshEmail(), password: PASSWORD, ...LEGAL_ACCEPTANCE })
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('lowercases the email so one address cannot become two accounts', async () => {
      const email = freshEmail();
      await request(http)
        .post('/api/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, ...LEGAL_ACCEPTANCE })
        .expect(201);

      await request(http)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD, ...LEGAL_ACCEPTANCE })
        .expect(409);
    });

    it('rejects a weak password', async () => {
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email: freshEmail(), password: 'short' })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/character/i);
    });

    it('rejects an invalid email', async () => {
      await request(http)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: PASSWORD })
        .expect(400);
    });

    it('strips properties the client is not allowed to set', async () => {
      // whitelist: true means an injected `status` or `id` never reaches the
      // service. Without it, a caller could self-assign a privileged field.
      const email = freshEmail();
      const response = await request(http)
        .post('/api/auth/register')
        .send({
          email,
          password: PASSWORD,
          ...LEGAL_ACCEPTANCE,
          id: 'attacker-chosen',
          status: 'admin',
        })
        .expect(201);

      expect(response.body.user.id).not.toBe('attacker-chosen');
    });

    it('publishes policy metadata and rejects missing or stale acceptance', async () => {
      const legal = await request(http).get('/api/legal').expect(200);
      expect(legal.body).toEqual({
        registrationRequired: true,
        terms: {
          version: 'terms-test-v1',
          url: 'https://finverse.example/legal/terms-test-v1',
        },
        privacyNotice: {
          version: 'privacy-test-v1',
          url: 'https://finverse.example/legal/privacy-test-v1',
        },
      });

      await request(http)
        .post('/api/auth/register')
        .send({ email: freshEmail(), password: PASSWORD })
        .expect(400);
      await request(http)
        .post('/api/auth/register')
        .send({
          email: freshEmail(),
          password: PASSWORD,
          ...LEGAL_ACCEPTANCE,
          privacyVersion: 'privacy-stale',
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------- login

  describe('login', () => {
    it('accepts correct credentials', async () => {
      const { email } = await register();
      const response = await request(http)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(response.body.tokens.accessToken).toBeTruthy();
    });

    it('is case-insensitive on the email', async () => {
      const { email } = await register();
      await request(http)
        .post('/api/auth/login')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('rejects a wrong password', async () => {
      const { email } = await register();
      await request(http)
        .post('/api/auth/login')
        .send({ email, password: 'definitely the wrong one' })
        .expect(401);
    });

    it('gives the same response for an unknown account as for a wrong password', async () => {
      // Different messages here would be a free account-enumeration oracle.
      const { email } = await register();

      const wrongPassword = await request(http)
        .post('/api/auth/login')
        .send({ email, password: 'definitely the wrong one' })
        .expect(401);

      const unknownAccount = await request(http)
        .post('/api/auth/login')
        .send({ email: freshEmail(), password: PASSWORD })
        .expect(401);

      expect(unknownAccount.body.message).toBe(wrongPassword.body.message);
    });

    it('locks an account after repeated failures', async () => {
      const { email } = await register();

      for (let i = 0; i < 8; i += 1) {
        await request(http).post('/api/auth/login').send({ email, password: `wrong-${i}` });
      }

      const locked = await request(http)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);

      // Locked out even with the *correct* password — otherwise the lock does
      // nothing against an attacker who eventually guesses right.
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------- protected routes

  describe('route protection', () => {
    const PROTECTED = [
      '/api/accounts',
      '/api/transactions',
      '/api/budgets',
      '/api/budgets/progress',
      '/api/insights',
      '/api/subscriptions',
      '/api/health-score',
      '/api/goals',
      '/api/notifications',
      '/api/bank-links',
      '/api/cash-flow-forecast',
      '/api/credit-cards',
      '/api/transactions/needs-review',
      '/api/privacy',
    ];

    it.each(PROTECTED)('%s requires a token', async (path) => {
      await request(http).get(path).expect(401);
    });

    it('POST /api/privacy/export requires a token', async () => {
      await request(http).post('/api/privacy/export').send({ password: PASSWORD }).expect(401);
    });

    it('rejects a malformed or tampered token', async () => {
      const { tokens } = await register();
      const tampered = `${tokens.accessToken.slice(0, -4)}AAAA`;

      await request(http).get('/api/accounts').set('Authorization', `Bearer ${tampered}`).expect(401);
      await request(http).get('/api/accounts').set('Authorization', 'Bearer nonsense').expect(401);
      await request(http).get('/api/accounts').set('Authorization', tokens.accessToken).expect(401);
    });

    it('ignores the retired x-user-id header', async () => {
      // The header used to *be* the authentication. It must now do nothing.
      await request(http).get('/api/accounts').set('x-user-id', 'user_demo').expect(401);
    });

    it('allows health and categories without a token', async () => {
      await request(http).get('/healthz').expect(200);
      await request(http).get('/api/categories').expect(200);
    });

    it('adds safe headers and a correlation id without accepting an unsafe id', async () => {
      const response = await request(http)
        .get('/api/categories')
        .set('x-request-id', 'unsafe id with spaces')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('accepts a valid token', async () => {
      const { tokens } = await register();
      await request(http)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });

    it('keeps connection metadata available while Plaid credentials are absent', async () => {
      const { tokens } = await register();
      const authorization = `Bearer ${tokens.accessToken}`;
      await request(http)
        .get('/api/bank-links')
        .set('Authorization', authorization)
        .expect(200, { count: 0, links: [] });
      await request(http)
        .post('/api/bank-links/link-token')
        .set('Authorization', authorization)
        .send({})
        .expect(503);
    });
  });

  // ---------------------------------------------------- user isolation

  describe('user isolation', () => {
    it('does not leak one user data to another', async () => {
      const alice = await register();
      const bob = await register();

      // Alice imports a ledger; Bob does not.
      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(201);

      const aliceRows = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);

      const bobRows = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);

      expect(aliceRows.body.count).toBeGreaterThan(0);
      expect(bobRows.body.count).toBe(0);
    });

    it('will not let one user read another transaction by id', async () => {
      const alice = await register();
      const bob = await register();

      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(201);

      const aliceRows = await request(http)
        .get('/api/transactions?limit=1')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);

      const victimId = aliceRows.body.transactions[0].id;

      // Bob guesses Alice's transaction id and tries to recategorize it.
      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(victimId)}/category`)
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .send({ categorySlug: 'coffee', createRule: false })
        .expect(404);
    });

    it('keeps budgets separate', async () => {
      const alice = await register();
      const bob = await register();

      await request(http)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ categorySlug: 'coffee', limitAmount: 5000 })
        .expect(201);

      const bobBudgets = await request(http)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);

      expect(bobBudgets.body).toHaveLength(0);
    });

    it('exports portable user data after password confirmation without credential material', async () => {
      const alice = await register();
      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(201);

      await request(http)
        .post('/api/privacy/export')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: 'wrong password that is long enough' })
        .expect(401);

      const exported = await request(http)
        .post('/api/privacy/export')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(200);

      expect(exported.body.format).toBe('finverse-portable-export');
      expect(exported.body.formatVersion).toBe(1);
      expect(exported.body.user.email).toBe(alice.email);
      expect(exported.body.transactions.length).toBeGreaterThan(0);
      expect(exported.body.sessions.some((session: { current: boolean }) => session.current)).toBe(
        true,
      );
      expect(exported.body.securityActivity.some((event: { kind: string }) => event.kind === 'data_exported')).toBe(
        true,
      );

      const serialized = JSON.stringify(exported.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('encryptedAccessToken');
      expect(serialized).not.toContain('providerItemId');
    });

    it('keeps an append-only history of optional consent choices per user', async () => {
      const alice = await register();
      const bob = await register();

      await request(http)
        .patch('/api/privacy/consents/analytics')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ granted: true })
        .expect(200);
      const changed = await request(http)
        .patch('/api/privacy/consents/analytics')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ granted: false })
        .expect(200);
      expect(changed.body.optionalConsents.analytics.granted).toBe(false);
      expect(changed.body.consentHistory.filter((row: { kind: string }) => row.kind === 'analytics')).toHaveLength(2);

      const bobDashboard = await request(http)
        .get('/api/privacy')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);
      expect(bobDashboard.body.optionalConsents.analytics.granted).toBe(false);
      expect(bobDashboard.body.consentHistory).toHaveLength(2);
      expect(
        bobDashboard.body.consentHistory.map((row: { kind: string }) => row.kind).sort(),
      ).toEqual(['privacy_notice', 'terms']);

      await request(http)
        .patch('/api/privacy/consents/terms')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ granted: false })
        .expect(400);
    });

    it('keeps savings goals separate', async () => {
      const alice = await register();
      const bob = await register();
      const created = await request(http)
        .post('/api/goals')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({
          name: 'Emergency fund',
          targetAmount: 500_000,
          initialAmount: 25_000,
          targetDate: '2027-08-08',
        })
        .expect(201);
      expect(created.body.savedAmount).toBe(25_000);

      const updated = await request(http)
        .post(`/api/goals/${created.body.goal.id}/contributions`)
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ amount: 15_000 })
        .expect(201);
      expect(updated.body.savedAmount).toBe(40_000);

      const bobGoals = await request(http)
        .get('/api/goals')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);
      expect(bobGoals.body.count).toBe(0);

      await request(http)
        .post(`/api/goals/${created.body.goal.id}/contributions`)
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .send({ amount: 100 })
        .expect(404);
    });

    it('validates goal money and dates before persistence', async () => {
      const user = await register();
      const auth = { Authorization: `Bearer ${user.tokens.accessToken}` };
      await request(http)
        .post('/api/goals')
        .set(auth)
        .send({ name: '', targetAmount: -1 })
        .expect(400);
      await request(http)
        .post('/api/goals')
        .set(auth)
        .send({ name: 'Past target', targetAmount: 1000, targetDate: '2020-01-01' })
        .expect(400);
    });

    it('generates deduplicated in-app alerts and keeps them isolated', async () => {
      const alice = await register();
      const bob = await register();
      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(201);
      const ledger = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      const budgetable = ledger.body.transactions.find(
        (row: { postedAt: string; amount: number; categorySlug: string; pending: boolean }) =>
          row.postedAt.startsWith('2026-08') &&
          row.amount < 0 &&
          !row.pending &&
          !['unknown', 'transfer', 'income', 'salary', 'refund'].includes(row.categorySlug),
      );
      expect(budgetable).toBeTruthy();
      await request(http)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ categorySlug: budgetable.categorySlug, limitAmount: 1 })
        .expect(201);
      const progress = await request(http)
        .get('/api/budgets/progress')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(progress.body.budgets[0].spentAmount).toBeGreaterThan(0);

      const first = await request(http)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(first.body.unread).toBeGreaterThan(0);
      const notificationId = first.body.notifications[0].id as string;

      const second = await request(http)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(second.body.count).toBe(first.body.count);

      await request(http)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(204);
      const bobRows = await request(http)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);
      expect(bobRows.body.count).toBe(0);
    });

    it('will not let one user revoke another session', async () => {
      const alice = await register();
      const bob = await register();

      const aliceSessions = await request(http)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);

      const victimSessionId = aliceSessions.body[0].id;

      await request(http)
        .delete(`/api/auth/sessions/${victimSessionId}`)
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(404);

      // Alice's session still works.
      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
    });
  });

  // -------------------------------------------------------------- refresh

  describe('refresh rotation', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const { tokens } = await register();

      const response = await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(response.body.tokens.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('makes the old refresh token single-use', async () => {
      const { tokens } = await register();

      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('revokes the whole family when a rotated token is replayed', async () => {
      // A captured refresh token being replayed is the signal that it leaked.
      // Both the attacker and the legitimate holder get logged out.
      const { tokens } = await register();

      const rotated = await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      const successor: Tokens = rotated.body.tokens;

      // Replay the spent token.
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      // The successor the legitimate user holds is now dead too.
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: successor.refreshToken })
        .expect(401);

      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${successor.accessToken}`)
        .expect(401);
    });

    it('rejects an unknown refresh token', async () => {
      await request(http)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });

  // ----------------------------------------- verification and recovery

  describe('email verification', () => {
    it('verifies an address once and rejects token replay', async () => {
      const { email, tokens } = await register();
      const sender = app.get<DevelopmentEmailSender>(EMAIL_SENDER);
      const token = sender.latest(email, 'verify_email')?.token;
      expect(token).toBeTruthy();

      await request(http)
        .post('/api/auth/email-verification/confirm')
        .send({ token })
        .expect(200);

      const me = await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(me.body.emailVerified).toBe(true);

      await request(http)
        .post('/api/auth/email-verification/confirm')
        .send({ token })
        .expect(400);
    });
  });

  describe('password reset', () => {
    it('does not reveal whether an email exists', async () => {
      const known = await register();
      const knownResponse = await request(http)
        .post('/api/auth/password-reset/request')
        .send({ email: known.email })
        .expect(202);
      const unknownResponse = await request(http)
        .post('/api/auth/password-reset/request')
        .send({ email: freshEmail() })
        .expect(202);
      expect(unknownResponse.body).toEqual(knownResponse.body);
    });

    it('changes the password, revokes sessions, and makes the token single-use', async () => {
      const { email, tokens } = await register();
      await request(http)
        .post('/api/auth/password-reset/request')
        .send({ email })
        .expect(202);

      const sender = app.get<DevelopmentEmailSender>(EMAIL_SENDER);
      const token = sender.latest(email, 'reset_password')?.token;
      expect(token).toBeTruthy();

      // Policy failure happens before token consumption, so the user can fix
      // the password without requesting a second email.
      await request(http)
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'short' })
        .expect(400);

      const nextPassword = 'a completely new safe passphrase';
      await request(http)
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: nextPassword })
        .expect(200);

      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
      await request(http)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);
      await request(http)
        .post('/api/auth/login')
        .send({ email, password: nextPassword })
        .expect(200);
      await request(http)
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'yet another safe passphrase' })
        .expect(400);
    });
  });

  // --------------------------------------------------------------- logout

  describe('logout', () => {
    it('invalidates the access token immediately, not when it expires', async () => {
      // If this fails, "log out everywhere" is a promise the API does not keep:
      // a stolen access token keeps working for its full lifetime.
      const { tokens } = await register();

      await request(http)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(204);

      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
    });

    it('ends every session with logout-all', async () => {
      const { email } = await register();

      const first = await request(http).post('/api/auth/login').send({ email, password: PASSWORD });
      const second = await request(http).post('/api/auth/login').send({ email, password: PASSWORD });

      await request(http)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${first.body.tokens.accessToken}`)
        .expect(200);

      for (const tokens of [first.body.tokens, second.body.tokens] as Tokens[]) {
        await request(http)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${tokens.accessToken}`)
          .expect(401);
      }
    });

    it('lists sessions and marks the current one', async () => {
      const { email, tokens } = await register();
      await request(http).post('/api/auth/login').send({ email, password: PASSWORD });

      const response = await request(http)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
      expect(response.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(response.body[0].tokenHash).toBeUndefined();
    });
  });

  // ---------------------------------------------------- account deletion

  describe('account deletion', () => {
    it('requires explicit confirmation and the current password', async () => {
      const { tokens } = await register();

      await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ password: PASSWORD, confirmation: 'delete' })
        .expect(400);

      await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ password: 'not the password', confirmation: 'DELETE' })
        .expect(401);

      // A failed attempt does not disable the account.
      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });

    it('disables access immediately, supports recovery, then purges every row', async () => {
      const { email, userId, tokens } = await register();
      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(201);

      const scheduled = await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ password: PASSWORD, confirmation: 'DELETE' })
        .expect(202);

      expect(new Date(scheduled.body.purgeScheduledFor).getTime()).toBeGreaterThan(Date.now());
      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(401);
      await request(http)
        .post('/api/auth/login')
        .send({ email, password: PASSWORD })
        .expect(403);

      const recovered = await request(http)
        .post('/api/auth/cancel-deletion')
        .send({ email, password: PASSWORD })
        .expect(200);
      const recoveredTokens: Tokens = recovered.body.tokens;

      const preserved = await request(http)
        .get('/api/transactions?limit=1000')
        .set('Authorization', `Bearer ${recoveredTokens.accessToken}`)
        .expect(200);
      expect(preserved.body.count).toBeGreaterThan(0);

      await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${recoveredTokens.accessToken}`)
        .send({ password: PASSWORD, confirmation: 'DELETE' })
        .expect(202);

      const deletions = app.get<AccountDeletionStore>(ACCOUNT_DELETION_STORE);
      expect(await deletions.purgeDue(new Date(Date.now() + 31 * 24 * 60 * 60 * 1_000))).toBe(1);

      const accounts = app.get<AccountStore>(ACCOUNT_STORE);
      const transactions = app.get<TransactionStore>(TRANSACTION_STORE);
      expect(await accounts.list(userId)).toHaveLength(0);
      expect((await transactions.list(userId)).length).toBe(0);

      await request(http)
        .post('/api/auth/cancel-deletion')
        .send({ email, password: PASSWORD })
        .expect(401);
    });
  });
});
