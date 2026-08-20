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
import { BANK_LINK_STORE, type BankLinkStore } from '../src/ports/banking';
import { ACCOUNT_DELETION_STORE, type AccountDeletionStore } from '../src/ports/auth';
import { EMAIL_SENDER } from '../src/ports/auth';
import type { DevelopmentEmailSender } from '../src/infra/auth/auth-action-stores';
import { totpAt } from '../src/domain/auth/totp';
import { isSpendingCategory, UNKNOWN_CATEGORY } from '../src/domain/categories';

// Must be set before anything calls loadConfig(), which memoises.
process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.LEGAL_TERMS_VERSION = 'terms-test-v1';
process.env.LEGAL_TERMS_URL = 'https://finverse.example/legal/terms-test-v1';
process.env.LEGAL_PRIVACY_VERSION = 'privacy-test-v1';
process.env.LEGAL_PRIVACY_URL = 'https://finverse.example/legal/privacy-test-v1';
process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
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

  describe('authenticator MFA', () => {
    it('gates login, rejects replay, supports one-time recovery, and can be disabled', async () => {
      const account = await register();
      const authorization = `Bearer ${account.tokens.accessToken}`;

      const initial = await request(http)
        .get('/api/auth/mfa')
        .set('Authorization', authorization)
        .expect(200);
      expect(initial.body).toEqual({ enabled: false, available: true, recoveryCodesRemaining: 0 });

      await request(http)
        .post('/api/auth/mfa/enroll')
        .set('Authorization', authorization)
        .send({ password: 'wrong password' })
        .expect(401);

      const enrollment = await request(http)
        .post('/api/auth/mfa/enroll')
        .set('Authorization', authorization)
        .send({ password: PASSWORD })
        .expect(201);
      expect(enrollment.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(enrollment.body.otpauthUri).toContain('otpauth://totp/');

      const code = totpAt(enrollment.body.secret, new Date()).code;
      const enabled = await request(http)
        .post('/api/auth/mfa/enable')
        .set('Authorization', authorization)
        .send({ code })
        .expect(200);
      expect(enabled.body.recoveryCodes).toHaveLength(10);

      const challenged = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: PASSWORD })
        .expect(200);
      expect(challenged.body.mfaRequired).toBe(true);
      expect(challenged.body.tokens).toBeUndefined();

      await request(http)
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: challenged.body.challengeToken, code: '000000' })
        .expect(401);

      const verified = await request(http)
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: challenged.body.challengeToken, code: totpAt(enrollment.body.secret, new Date()).code })
        .expect(200);
      expect(verified.body.tokens.accessToken).toBeTruthy();

      await request(http)
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: challenged.body.challengeToken, code: totpAt(enrollment.body.secret, new Date()).code })
        .expect(401);

      const recoveryChallenge = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: PASSWORD })
        .expect(200);
      await request(http)
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: recoveryChallenge.body.challengeToken, code: enabled.body.recoveryCodes[0] })
        .expect(200);

      const replayChallenge = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: PASSWORD })
        .expect(200);
      await request(http)
        .post('/api/auth/mfa/verify')
        .send({ challengeToken: replayChallenge.body.challengeToken, code: enabled.body.recoveryCodes[0] })
        .expect(401);

      await request(http)
        .delete('/api/auth/mfa')
        .set('Authorization', authorization)
        .send({ password: PASSWORD, code: enabled.body.recoveryCodes[1] })
        .expect(200, { enabled: false });

      const ordinaryLogin = await request(http)
        .post('/api/auth/login')
        .send({ email: account.email, password: PASSWORD })
        .expect(200);
      expect(ordinaryLogin.body.tokens.accessToken).toBeTruthy();
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
      '/api/analytics',
      '/api/data-quality',
      '/api/subscriptions',
      '/api/health-score',
      '/api/assistant',
      '/api/goals',
      '/api/notifications',
      '/api/bank-links',
      '/api/cash-flow-forecast',
      '/api/credit-cards',
      '/api/transactions/needs-review',
      '/api/categorization-rules',
      '/api/privacy',
      '/api/reports/monthly.pdf',
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
      const health = await request(http).get('/healthz').expect(200);
      expect(health.body.service).toBe('finverse-api');
      await request(http).get('/api/readiness').expect(200);
      const version = await request(http).get('/api/version').expect(200);
      expect(version.body.service).toBe('finverse-api');
      expect(version.body).toHaveProperty('sha');
      expect(version.body.schema).toMatch(/^\d{3}_.+\.sql$/);
      await request(http).get('/api/categories').expect(200);
      const metrics = await request(http).get('/api/metrics').expect(200);
      expect(metrics.headers['content-type']).toContain('text/plain');
      expect(metrics.text).toContain('finverse_http_requests_total');
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

      const quality = await request(http)
        .get('/api/data-quality')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(quality.body).toMatchObject({
        status: 'no_data',
        score: 100,
        transactionCount: 0,
        accountCoverage: 1,
        issues: [],
      });
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
        .expect(400);
      await request(http)
        .post('/api/bank-links/link-token')
        .set('Authorization', authorization)
        .send({ password: 'wrong password' })
        .expect(401);
      await request(http)
        .post('/api/bank-links/link-token')
        .set('Authorization', authorization)
        .send({ password: PASSWORD })
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
      expect(aliceRows.body.nextCursor).toEqual(expect.any(String));

      const olderRows = await request(http)
        .get(`/api/transactions?limit=1&before=${encodeURIComponent(aliceRows.body.nextCursor)}`)
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(olderRows.body.transactions[0].id).not.toBe(victimId);

      // Bob guesses Alice's transaction id and tries to recategorize it.
      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(victimId)}/category`)
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .send({ categorySlug: 'coffee', createRule: false })
        .expect(404);
    });

    it('lets users inspect and delete their categorization rules without crossing accounts', async () => {
      const alice = await register();
      const bob = await register();
      const aliceAuth = { Authorization: `Bearer ${alice.tokens.accessToken}` };
      const bobAuth = { Authorization: `Bearer ${bob.tokens.accessToken}` };

      await request(http).post('/api/sync').set(aliceAuth).expect(201);
      const rows = await request(http)
        .get('/api/transactions?limit=1')
        .set(aliceAuth)
        .expect(200);
      const transactionId = rows.body.transactions[0].id as string;

      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(transactionId)}/category`)
        .set(aliceAuth)
        .send({ categorySlug: 'groceries', createRule: true })
        .expect(200);

      const aliceRules = await request(http)
        .get('/api/categorization-rules')
        .set(aliceAuth)
        .expect(200);
      expect(aliceRules.body.rules).toHaveLength(1);
      expect(aliceRules.body.rules[0]).toMatchObject({
        matchType: 'contains',
        categorySlug: 'groceries',
        priority: 0,
      });
      const ruleId = aliceRules.body.rules[0].id as string;

      await request(http)
        .get('/api/categorization-rules')
        .set(bobAuth)
        .expect(200, { rules: [] });
      await request(http)
        .delete(`/api/categorization-rules/${encodeURIComponent(ruleId)}`)
        .set(bobAuth)
        .expect(404);

      await request(http)
        .delete(`/api/categorization-rules/${encodeURIComponent(ruleId)}`)
        .set(aliceAuth)
        .expect(204);
      await request(http)
        .get('/api/categorization-rules')
        .set(aliceAuth)
        .expect(200, { rules: [] });
    });

    it('supports validated transaction feed filters', async () => {
      const alice = await register();
      await request(http)
        .post('/api/sync')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(201);

      const filtered = await request(http)
        .get('/api/transactions?kind=income&pending=false&minAmount=1&maxAmount=100000000')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);

      expect(filtered.body.count).toBeGreaterThan(0);
      expect(filtered.body.transactions.every((row: { categorySlug: string; pending: boolean; amount: number }) =>
        ['income', 'salary', 'freelance', 'refunds', 'interest_income'].includes(row.categorySlug) &&
        row.pending === false && Math.abs(row.amount) >= 1 && Math.abs(row.amount) <= 100000000,
      )).toBe(true);

      const natural = await request(http)
        .get('/api/transactions?search=coffee%20over%20%241')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(natural.body.interpretation).toContain('category Coffee');
      expect(natural.body.transactions.every((row: { categorySlug: string; amount: number }) =>
        row.categorySlug === 'coffee' && Math.abs(row.amount) > 100,
      )).toBe(true);

      const analytics = await request(http)
        .get('/api/analytics?period=3m&asOf=2026-08-07&currency=USD')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(analytics.body.period).toEqual({ start: '2026-05-10', end: '2026-08-07' });
      expect(analytics.body.grossExpenses).toBeGreaterThan(0);
      expect(analytics.body.spendingByCategory.length).toBeGreaterThan(0);
      expect(analytics.body.velocity).toHaveProperty('projectedPeriodSpendFormatted');
      expect(analytics.body.timeline.length).toBeGreaterThan(0);

      const assistant = await request(http)
        .get('/api/assistant?question=Where%20did%20I%20spend%20the%20most%3F')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(assistant.body.intent).toBe('top_category');
      expect(assistant.body.source).toBe('deterministic');
      expect(assistant.body.answer).toContain('$');
      expect(JSON.stringify(assistant.body)).not.toContain('providerTxnId');

      const lifetime = await request(http)
        .get('/api/analytics?period=lifetime&asOf=2026-08-07&currency=USD')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(lifetime.body.period.start).toBeDefined();
      expect(lifetime.body.period.start <= lifetime.body.period.end).toBe(true);
      expect(lifetime.body.period.end).toBe('2026-08-07');

      await request(http)
        .get('/api/transactions?pending=maybe')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(400);
      await request(http)
        .get('/api/transactions?from=2026-02-01')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(400);
    });

    it('persists private transaction annotations without crossing user boundaries', async () => {
      const alice = await register();
      const bob = await register();
      const aliceAuth = { Authorization: `Bearer ${alice.tokens.accessToken}` };
      const bobAuth = { Authorization: `Bearer ${bob.tokens.accessToken}` };

      await request(http).post('/api/sync').set(aliceAuth).expect(201);
      const rows = await request(http)
        .get('/api/transactions?limit=1')
        .set(aliceAuth)
        .expect(200);
      const id = rows.body.transactions[0].id as string;

      const updated = await request(http)
        .patch(`/api/transactions/${encodeURIComponent(id)}/preferences`)
        .set(aliceAuth)
        .send({
          merchantOverride: 'My grocery store',
          note: 'Remember the receipt for reimbursement',
          excludedFromAnalytics: true,
          isRecurring: true,
          duplicateReported: true,
        })
        .expect(200);
      expect(updated.body.transaction.merchantOverride).toBe('My grocery store');
      expect(updated.body.transaction.note).toContain('reimbursement');
      expect(updated.body.transaction.excludedFromAnalytics).toBe(true);
      expect(updated.body.transaction.isRecurring).toBe(true);
      expect(updated.body.transaction.recurringOverride).toBe(true);
      expect(updated.body.transaction.duplicateReported).toBe(true);

      const foundByNote = await request(http)
        .get('/api/transactions?search=reimbursement')
        .set(aliceAuth)
        .expect(200);
      expect(foundByNote.body.count).toBe(1);

      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(id)}/preferences`)
        .set(bobAuth)
        .send({ note: 'should not be visible' })
        .expect(404);
      await request(http)
        .patch(`/api/transactions/${encodeURIComponent(id)}/preferences`)
        .set(aliceAuth)
        .send({ merchantOverride: 'x'.repeat(121) })
        .expect(400);
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

    it('creates editable manual assets and debts without exposing provider accounts', async () => {
      const alice = await register();
      const bob = await register();
      const aliceAuth = { Authorization: `Bearer ${alice.tokens.accessToken}` };
      const bobAuth = { Authorization: `Bearer ${bob.tokens.accessToken}` };

      const created = await request(http)
        .post('/api/accounts/manual')
        .set(aliceAuth)
        .send({ name: 'Wallet cash', type: 'cash', currency: 'cad', balanceCurrent: 12500 })
        .expect(201);
      expect(created.body.source).toBe('manual');
      expect(created.body.currency).toBe('CAD');
      expect(created.body.id).toMatch(/^manual_/);

      const updated = await request(http)
        .patch(`/api/accounts/manual/${created.body.id}`)
        .set(aliceAuth)
        .send({ name: 'Wallet cash', type: 'cash', currency: 'CAD', balanceCurrent: 14000 })
        .expect(200);
      expect(updated.body.balanceCurrent).toBe(14000);

      const property = await request(http)
        .post('/api/accounts/manual')
        .set(aliceAuth)
        .send({
          name: 'Primary residence',
          type: 'property',
          currency: 'CAD',
          balanceCurrent: 65000000,
        })
        .expect(201);
      expect(property.body.type).toBe('property');
      expect(property.body.balanceCurrent).toBe(65000000);

      await request(http)
        .patch(`/api/accounts/manual/${created.body.id}`)
        .set(bobAuth)
        .send({ name: 'Stolen', type: 'cash', currency: 'CAD', balanceCurrent: 1 })
        .expect(404);
      await request(http)
        .post('/api/accounts/manual')
        .set(aliceAuth)
        .send({ name: 'Invalid debt', type: 'loan', currency: 'CAD', balanceCurrent: 100 })
        .expect(400);

      await request(http).post('/api/sync').set(aliceAuth).expect(201);
      await request(http)
        .patch('/api/accounts/manual/acc_checking')
        .set(aliceAuth)
        .send({ name: 'Bank account', type: 'cash', currency: 'USD', balanceCurrent: 1 })
        .expect(404);

      await request(http)
        .delete(`/api/accounts/manual/${created.body.id}`)
        .set(aliceAuth)
        .expect(200, { removed: true });
    });

    it('accepts a manually entered credit card and plans against it', async () => {
      // Connecting a bank is gated on a commercial agreement, so without this
      // the entire credit-card surface — utilisation, pay-down target, safe
      // payment window — was unreachable for every user of the product.
      const account = await register();
      const auth = { Authorization: `Bearer ${account.tokens.accessToken}` };

      const card = await request(http)
        .post('/api/accounts/manual')
        .set(auth)
        .send({
          name: 'Rewards Visa',
          type: 'credit_card',
          currency: 'CAD',
          balanceCurrent: -125_000,
          creditLimit: 500_000,
          statementDay: 18,
          paymentDueDay: 12,
        })
        .expect(201);
      expect(card.body.utilization).toBeCloseTo(0.25);

      const planned = await request(http).get('/api/credit-cards').set(auth).expect(200);
      expect(planned.body).toHaveLength(1);

      // Sign carries meaning (ADR-0003): a card entered as a positive balance
      // would count as an asset and overstate net position by twice the debt.
      await request(http)
        .post('/api/accounts/manual')
        .set(auth)
        .send({ name: 'Backwards', type: 'credit_card', currency: 'CAD', balanceCurrent: 5_000 })
        .expect(400);

      // Card-only fields on a chequing account are a mistake worth catching
      // rather than silently storing.
      await request(http)
        .post('/api/accounts/manual')
        .set(auth)
        .send({
          name: 'Chequing',
          type: 'checking',
          currency: 'CAD',
          balanceCurrent: 1_000,
          creditLimit: 500_000,
        })
        .expect(400);
    });

    it('generates a private multi-page monthly PDF report with charts', async () => {
      const account = await register();
      const authorization = `Bearer ${account.tokens.accessToken}`;
      await request(http)
        .post('/api/sync')
        .set('Authorization', authorization)
        .expect(201);
      await request(http)
        .post('/api/budgets')
        .set('Authorization', authorization)
        .send({ categorySlug: 'restaurants', limitAmount: 20000 })
        .expect(201);

      const response = await request(http)
        .get('/api/reports/monthly.pdf?asOf=2026-08-08')
        .set('Authorization', authorization)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain(
        'finverse-monthly-report-2026-08.pdf',
      );
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(response.body.length).toBeGreaterThan(5_000);

      await request(http)
        .get('/api/reports/monthly.pdf?asOf=2026-02-31')
        .set('Authorization', authorization)
        .expect(400);
    });

    it('keeps cash-flow planning currency-specific and validates the code', async () => {
      const account = await register();
      const authorization = `Bearer ${account.tokens.accessToken}`;
      await request(http)
        .post('/api/sync')
        .set('Authorization', authorization)
        .expect(201);

      const forecast = await request(http)
        .get('/api/cash-flow-forecast?days=30&asOf=2026-08-08&currency=USD')
        .set('Authorization', authorization)
        .expect(200);
      expect(forecast.body.currency).toBe('USD');
      expect(forecast.body.points).toHaveLength(30);
      expect(forecast.body.startingBalanceFormatted).toEqual(expect.any(String));

      await request(http)
        .get('/api/cash-flow-forecast?currency=usd')
        .set('Authorization', authorization)
        .expect(400);

      const scenario = await request(http)
        .get('/api/purchase-scenario?days=30&asOf=2026-08-08&date=2026-08-09&amount=10000&currency=USD')
        .set('Authorization', authorization)
        .expect(200);
      expect(scenario.body.currency).toBe('USD');
      expect(scenario.body.purchase.amountFormatted).toEqual(expect.any(String));
      expect(scenario.body.warnings).toHaveLength(2);
    });

    it('requires an authenticator code to export or delete when MFA is enabled', async () => {
      const alice = await register();
      const enrollment = await request(http)
        .post('/api/auth/mfa/enroll')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(201);
      await request(http)
        .post('/api/auth/mfa/enable')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ code: totpAt(enrollment.body.secret, new Date()).code })
        .expect(200);
      await request(http)
        .post('/api/privacy/export')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(401);
      const exported = await request(http)
        .post('/api/privacy/export')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD, mfaCode: totpAt(enrollment.body.secret, new Date()).code })
        .expect(200);
      expect(exported.body.user.email).toBe(alice.email);
      await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD, confirmation: 'DELETE' })
        .expect(401);
      await request(http)
        .post('/api/bank-links/link-token')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .send({ password: PASSWORD })
        .expect(401);
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
      expect(exported.body.authentication).toEqual({
        mfaEnabled: false,
        recoveryCodesRemaining: 0,
      });
      expect(exported.body.transactions.length).toBeGreaterThan(0);
      expect(exported.body.netWorthHistory.length).toBeGreaterThan(0);
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
      expect(serialized).not.toContain('encryptedSecret');
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
          row.categorySlug !== UNKNOWN_CATEGORY &&
          isSpendingCategory(row.categorySlug),
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
      expect(
        first.body.notifications.some(
          (notification: { kind: string }) => notification.kind === 'subscription',
        ),
      ).toBe(true);
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
      await request(http)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(204);
      const cleared = await request(http)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
        .expect(200);
      expect(cleared.body.unread).toBe(0);
      const bobRows = await request(http)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
        .expect(200);
      expect(bobRows.body.count).toBe(0);
    });

    it('honours alert preferences before deriving financial notifications', async () => {
      const user = await register();
      const authorization = `Bearer ${user.tokens.accessToken}`;
      await request(http).post('/api/sync').set('Authorization', authorization).expect(201);
      await request(http)
        .patch('/api/notifications/preferences')
        .set('Authorization', authorization)
        .send({ subscriptions: false, bills: false, unusualTransactions: false })
        .expect(200);

      const response = await request(http)
        .get('/api/notifications')
        .set('Authorization', authorization)
        .expect(200);
      const kinds = response.body.notifications.map(
        (notification: { kind: string }) => notification.kind,
      );
      expect(kinds).not.toContain('subscription');
      expect(kinds).not.toContain('bill');
      expect(kinds).not.toContain('unusual_transaction');
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

    it('allows only one concurrent request to spend a refresh token', async () => {
      const { tokens } = await register();

      const responses = await Promise.all([
        request(http)
          .post('/api/auth/refresh')
          .send({ refreshToken: tokens.refreshToken }),
        request(http)
          .post('/api/auth/refresh')
          .send({ refreshToken: tokens.refreshToken }),
      ]);

      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 401)).toHaveLength(1);
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

    it('does not start deletion while a connected bank cannot be revoked', async () => {
      const { userId, tokens } = await register();
      const links = app.get<BankLinkStore>(BANK_LINK_STORE);
      await links.create(userId, {
        id: 'link-deletion-revocation',
        provider: 'plaid',
        providerItemId: 'item-deletion-revocation',
        institutionId: 'ins_test',
        institutionName: 'Test Bank',
        encryptedAccessToken: 'ciphertext',
        cursor: null,
        status: 'healthy',
        errorCode: null,
        lastSyncedAt: null,
        createdAt: new Date().toISOString(),
      });

      // The in-memory test provider has no Plaid credentials. The revocation
      // boundary must fail closed instead of deleting our row while leaving an
      // external provider Item alive.
      await request(http)
        .delete('/api/auth/account')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ password: PASSWORD, confirmation: 'DELETE' })
        .expect(503);

      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect((await links.get(userId, 'link-deletion-revocation'))?.status).toBe('healthy');
    });
  });
});
