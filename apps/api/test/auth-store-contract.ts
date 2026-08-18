/**
 * One suite, run against every implementation of the identity ports.
 *
 * The auth API tests exercise the in-memory adapter only. Without this file the
 * Postgres user/session/event stores — the ones that will actually hold
 * credentials — would ship with no coverage at all.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Session } from '../src/domain/auth/types';
import {
  DuplicateEmailError,
  type AuthActionTokenStore,
  type AuthEventStore,
  type SessionStore,
  type UserStore,
} from '../src/ports/auth';

export interface AuthStoreSet {
  users: UserStore;
  sessions: SessionStore;
  events: AuthEventStore;
  actions: AuthActionTokenStore;
  reset(): Promise<void>;
  teardown(): Promise<void>;
}

// listActive is intentionally evaluated against the adapter/database wall
// clock. Keep its live fixtures relative to the test run so this contract does
// not start failing simply because a hard-coded future date has arrived.
const NOW = new Date();
const HOUR = 60 * 60 * 1000;

export function runAuthStoreContract(name: string, create: () => Promise<AuthStoreSet>): void {
  describe(`auth store contract: ${name}`, () => {
    let stores: AuthStoreSet;

    beforeEach(async () => {
      stores ??= await create();
      await stores.reset();
    });

    afterAll(async () => {
      await stores?.teardown();
    });

    async function makeUser(email = 'alice@example.com') {
      return stores.users.create({
        id: `user-${email}`,
        email,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
        displayName: 'Alice',
      });
    }

    function makeSession(userId: string, overrides: Partial<Session> = {}): Session {
      return {
        id: `sess-${Math.random().toString(36).slice(2)}`,
        userId,
        familyId: 'family-1',
        tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR),
        lastUsedAt: null,
        revokedAt: null,
        revokedReason: null,
        userAgent: 'vitest',
        ipAddress: '127.0.0.1',
        ...overrides,
      };
    }

    describe('users', () => {
      it('round-trips', async () => {
        const created = await makeUser();
        const found = await stores.users.findById(created.id);

        expect(found?.email).toBe('alice@example.com');
        expect(found?.displayName).toBe('Alice');
        expect(found?.status).toBe('active');
        expect(found?.emailVerifiedAt).toBeNull();
      });

      it('finds by email', async () => {
        await makeUser();
        expect((await stores.users.findByEmail('alice@example.com'))?.displayName).toBe('Alice');
      });

      it('rejects a duplicate email', async () => {
        // The unique index is the arbiter, not a prior read — two simultaneous
        // registrations must not both succeed.
        await makeUser();
        await expect(
          stores.users.create({
            id: 'someone-else',
            email: 'alice@example.com',
            passwordHash: 'x',
            displayName: null,
          }),
        ).rejects.toBeInstanceOf(DuplicateEmailError);
      });

      it('returns null for an unknown email', async () => {
        expect(await stores.users.findByEmail('nobody@example.com')).toBeNull();
      });

      it('updates the password hash', async () => {
        const user = await makeUser();
        await stores.users.updatePasswordHash(user.id, 'new-hash');
        expect((await stores.users.findById(user.id))?.passwordHash).toBe('new-hash');
      });

      it('updates status', async () => {
        const user = await makeUser();
        await stores.users.setStatus(user.id, 'locked');
        expect((await stores.users.findById(user.id))?.status).toBe('locked');
      });

      it('marks an email verified without changing identity', async () => {
        const user = await makeUser();
        await stores.users.markEmailVerified(user.id, NOW);

        const found = await stores.users.findById(user.id);
        expect(found?.emailVerifiedAt).toEqual(NOW);
        expect(found?.email).toBe(user.email);
      });
    });

    describe('sessions', () => {
      it('round-trips and finds by token hash', async () => {
        const user = await makeUser();
        const session = makeSession(user.id);
        await stores.sessions.create(session);

        const found = await stores.sessions.findByTokenHash(session.tokenHash);
        expect(found?.id).toBe(session.id);
        expect(found?.familyId).toBe('family-1');
        expect(found?.revokedAt).toBeNull();
      });

      it('scopes findById by user', async () => {
        const alice = await makeUser('alice@example.com');
        const bob = await makeUser('bob@example.com');
        const session = makeSession(alice.id);
        await stores.sessions.create(session);

        expect(await stores.sessions.findById(alice.id, session.id)).not.toBeNull();
        // Bob must not reach Alice's session by guessing its id.
        expect(await stores.sessions.findById(bob.id, session.id)).toBeNull();
      });

      it('lists only active sessions, newest first', async () => {
        const user = await makeUser();
        const live = makeSession(user.id, { issuedAt: new Date(NOW.getTime() - HOUR) });
        const newer = makeSession(user.id, { issuedAt: NOW });
        const expired = makeSession(user.id, {
          expiresAt: new Date(NOW.getTime() - HOUR),
        });
        const revoked = makeSession(user.id, {
          revokedAt: NOW,
          revokedReason: 'logout',
        });

        for (const s of [live, newer, expired, revoked]) await stores.sessions.create(s);
        // create() ignores revokedAt on insert in some adapters; revoke explicitly.
        await stores.sessions.revoke(revoked.id, 'logout', NOW);

        const active = await stores.sessions.listActive(user.id);
        const ids = active.map((s) => s.id);

        expect(ids).toContain(live.id);
        expect(ids).toContain(newer.id);
        expect(ids).not.toContain(expired.id);
        expect(ids).not.toContain(revoked.id);
        expect(ids[0]).toBe(newer.id);
      });

      it('preserves the original revocation reason', async () => {
        // Overwriting 'rotated' would destroy the signal reuse detection needs.
        const user = await makeUser();
        const session = makeSession(user.id);
        await stores.sessions.create(session);

        await stores.sessions.revoke(session.id, 'rotated', NOW);
        await stores.sessions.revoke(session.id, 'logout', new Date(NOW.getTime() + 1000));

        const found = await stores.sessions.findByTokenHash(session.tokenHash);
        expect(found?.revokedReason).toBe('rotated');
      });

      it('spends a live refresh session exactly once with its successor', async () => {
        const user = await makeUser();
        const current = makeSession(user.id, { familyId: 'family-rotate' });
        const successor = makeSession(user.id, {
          familyId: current.familyId,
          issuedAt: new Date(NOW.getTime() + 1),
        });
        await stores.sessions.create(current);

        expect(await stores.sessions.rotate(current.id, successor, NOW)).toBe(true);
        expect(await stores.sessions.rotate(current.id, makeSession(user.id), NOW)).toBe(false);
        expect((await stores.sessions.findByTokenHash(current.tokenHash))?.revokedReason).toBe('rotated');
        expect(await stores.sessions.findByTokenHash(successor.tokenHash)).not.toBeNull();
      });

      it('revokes an entire family', async () => {
        const user = await makeUser();
        const a = makeSession(user.id, { familyId: 'fam-a' });
        const b = makeSession(user.id, { familyId: 'fam-a' });
        const other = makeSession(user.id, { familyId: 'fam-b' });
        for (const s of [a, b, other]) await stores.sessions.create(s);

        const count = await stores.sessions.revokeFamily('fam-a', 'reuse_detected', NOW);
        expect(count).toBe(2);

        expect((await stores.sessions.findByTokenHash(a.tokenHash))?.revokedAt).not.toBeNull();
        expect((await stores.sessions.findByTokenHash(other.tokenHash))?.revokedAt).toBeNull();
      });

      it('revokes every session for a user without touching another user', async () => {
        const alice = await makeUser('alice@example.com');
        const bob = await makeUser('bob@example.com');
        const aliceSession = makeSession(alice.id);
        const bobSession = makeSession(bob.id);
        await stores.sessions.create(aliceSession);
        await stores.sessions.create(bobSession);

        expect(await stores.sessions.revokeAllForUser(alice.id, 'logout_all', NOW)).toBe(1);
        expect(await stores.sessions.listActive(bob.id)).toHaveLength(1);
      });

      it('records last use', async () => {
        const user = await makeUser();
        const session = makeSession(user.id);
        await stores.sessions.create(session);

        const at = new Date(NOW.getTime() + 5000);
        await stores.sessions.touch(session.id, at);

        const found = await stores.sessions.findByTokenHash(session.tokenHash);
        expect(found?.lastUsedAt?.getTime()).toBe(at.getTime());
      });

      it('deletes expired rows', async () => {
        const user = await makeUser();
        const expired = makeSession(user.id, { expiresAt: new Date(NOW.getTime() - HOUR) });
        const live = makeSession(user.id);
        await stores.sessions.create(expired);
        await stores.sessions.create(live);

        expect(await stores.sessions.deleteExpired(NOW)).toBe(1);
        expect(await stores.sessions.findByTokenHash(live.tokenHash)).not.toBeNull();
      });
    });

    describe('auth events', () => {
      async function recordFailure(email: string, at: Date): Promise<void> {
        await stores.events.record({
          id: `evt-${Math.random().toString(36).slice(2)}`,
          userId: null,
          emailAttempted: email,
          kind: 'login',
          succeeded: false,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          detail: 'bad credentials',
          createdAt: at,
        });
      }

      it('counts recent failures for one address', async () => {
        await recordFailure('alice@example.com', NOW);
        await recordFailure('alice@example.com', new Date(NOW.getTime() - 60_000));
        await recordFailure('bob@example.com', NOW);

        const failures = await stores.events.recentFailures(
          'alice@example.com',
          new Date(NOW.getTime() - 5 * 60_000),
        );
        expect(failures).toHaveLength(2);
      });

      it('excludes failures older than the cutoff', async () => {
        await recordFailure('alice@example.com', new Date(NOW.getTime() - HOUR));
        const failures = await stores.events.recentFailures(
          'alice@example.com',
          new Date(NOW.getTime() - 5 * 60_000),
        );
        expect(failures).toHaveLength(0);
      });

      it('does not count passkey failures toward password lockout', async () => {
        await stores.events.record({
          id: 'evt-passkey-fail',
          userId: null,
          emailAttempted: 'alice@example.com',
          kind: 'passkey_login',
          succeeded: false,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          detail: 'assertion failed',
          createdAt: NOW,
        });
        await recordFailure('alice@example.com', NOW);
        const failures = await stores.events.recentFailures(
          'alice@example.com',
          new Date(NOW.getTime() - 5 * 60_000),
        );
        expect(failures).toHaveLength(1);
      });

      it('counts failures against an address with no account', async () => {
        // There is no user row to attach these to, but they still have to count
        // toward lockout or an attacker gets unlimited guesses at any address.
        await recordFailure('ghost@example.com', NOW);
        const failures = await stores.events.recentFailures(
          'ghost@example.com',
          new Date(NOW.getTime() - 5 * 60_000),
        );
        expect(failures).toHaveLength(1);
      });

      it('lists a user history newest first', async () => {
        const user = await makeUser();
        for (const [i, kind] of (['register', 'login', 'logout'] as const).entries()) {
          await stores.events.record({
            id: `evt-${i}`,
            userId: user.id,
            emailAttempted: user.email,
            kind,
            succeeded: true,
            ipAddress: null,
            userAgent: null,
            detail: null,
            createdAt: new Date(NOW.getTime() + i * 1000),
          });
        }

        const history = await stores.events.listForUser(user.id, 10);
        expect(history).toHaveLength(3);
        expect(history[0]?.kind).toBe('logout');
      });
    });

    describe('action tokens', () => {
      it('is single-use and rejects expiry', async () => {
        const user = await makeUser();
        await stores.actions.issue(user.id, 'reset_password', 'live-hash', new Date(NOW.getTime() + HOUR));
        await stores.actions.issue(user.id, 'verify_email', 'expired-hash', new Date(NOW.getTime() - HOUR));

        expect(await stores.actions.consume('reset_password', 'live-hash', NOW)).toBe(user.id);
        expect(await stores.actions.consume('reset_password', 'live-hash', NOW)).toBeNull();
        expect(await stores.actions.consume('verify_email', 'expired-hash', NOW)).toBeNull();
      });

      it('invalidates an older live token of the same kind', async () => {
        const user = await makeUser();
        const expiry = new Date(NOW.getTime() + HOUR);
        await stores.actions.issue(user.id, 'verify_email', 'old-hash', expiry);
        await stores.actions.issue(user.id, 'verify_email', 'new-hash', expiry);

        expect(await stores.actions.consume('verify_email', 'old-hash', NOW)).toBeNull();
        expect(await stores.actions.consume('verify_email', 'new-hash', NOW)).toBe(user.id);
      });
    });
  });
}
