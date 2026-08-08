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
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Must be set before anything calls loadConfig(), which memoises.
process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
// This suite drives hundreds of requests from one address. Per-IP throttling is
// real and is exercised in auth-throttle.spec.ts; here it would only produce
// 429s unrelated to what each test is checking. Account lockout — the control
// that actually stops credential stuffing — stays on and is asserted below.
process.env.THROTTLE_DISABLED = 'true';

const PASSWORD = 'correct horse battery staple';

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
  const freshEmail = (): string => `user${(counter += 1)}-${Date.now()}@example.com`;

  async function register(email = freshEmail()): Promise<{ email: string; tokens: Tokens }> {
    const response = await request(http)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    return { email, tokens: response.body.tokens };
  }

  // ------------------------------------------------------------- register

  describe('registration', () => {
    it('creates an account and returns a session', async () => {
      const email = freshEmail();
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);

      expect(response.body.user.email).toBe(email);
      expect(response.body.tokens.accessToken).toBeTruthy();
      expect(response.body.tokens.refreshToken).toBeTruthy();
      expect(response.body.tokens.tokenType).toBe('Bearer');
    });

    it('never returns the password hash', async () => {
      const response = await request(http)
        .post('/api/auth/register')
        .send({ email: freshEmail(), password: PASSWORD })
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('lowercases the email so one address cannot become two accounts', async () => {
      const email = freshEmail();
      await request(http)
        .post('/api/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(201);

      await request(http)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD })
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
        .send({ email, password: PASSWORD, id: 'attacker-chosen', status: 'admin' })
        .expect(201);

      expect(response.body.user.id).not.toBe('attacker-chosen');
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
      '/api/cash-flow-forecast',
      '/api/credit-cards',
      '/api/transactions/needs-review',
    ];

    it.each(PROTECTED)('%s requires a token', async (path) => {
      await request(http).get(path).expect(401);
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

    it('accepts a valid token', async () => {
      const { tokens } = await register();
      await request(http)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
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
});
