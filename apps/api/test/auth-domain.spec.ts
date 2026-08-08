import { describe, expect, it } from 'vitest';

import { evaluateLockout, MAX_FAILED_ATTEMPTS } from '../src/domain/auth/lockout';
import {
  checkPassword,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
} from '../src/domain/auth/password-policy';
import { evaluateRefresh } from '../src/domain/auth/session';
import type { Session } from '../src/domain/auth/types';

describe('password policy', () => {
  it('requires length', () => {
    expect(checkPassword('short').ok).toBe(false);
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
  });

  it('accepts a long passphrase with no special characters', () => {
    // NIST SP 800-63B: length and a blocklist beat composition rules. If this
    // ever starts failing, someone has reintroduced "must contain a symbol".
    expect(checkPassword('correct horse battery staple').ok).toBe(true);
  });

  it('caps length so Argon2 cost cannot be driven by input size', () => {
    expect(checkPassword('a'.repeat(200)).ok).toBe(false);
  });

  it('rejects common passwords that clear the length rule', () => {
    expect(checkPassword('password1234').ok).toBe(false);
    expect(checkPassword('passwordpassword').ok).toBe(false);
  });

  it('rejects a long string of one repeated character', () => {
    expect(checkPassword('aaaaaaaaaaaaaaaa').ok).toBe(false);
  });

  it('rejects a password containing the email local part', () => {
    expect(checkPassword('samuel-is-here-1', 'samuel@example.com').ok).toBe(false);
  });

  it('reports every problem at once', () => {
    const result = checkPassword('aaa');
    expect(result.problems.length).toBeGreaterThan(1);
  });
});

describe('email handling', () => {
  it('normalises case and whitespace so one address cannot become two accounts', () => {
    expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com');
  });

  it.each([
    ['sam@example.com', true],
    ['sam+tag@example.co.uk', true],
    ['no-at-sign', false],
    ['no@domain', false],
    ['two@@example.com', false],
    ['spaces in@example.com', false],
  ])('%s -> %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('lockout', () => {
  const now = new Date('2026-08-07T12:00:00Z');
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

  it('allows attempts below the threshold', () => {
    const state = evaluateLockout([minutesAgo(1), minutesAgo(2)], now);
    expect(state.locked).toBe(false);
    expect(state.attemptsRemaining).toBe(MAX_FAILED_ATTEMPTS - 2);
  });

  it('locks at exactly the threshold, not one past it', () => {
    const failures = Array.from({ length: MAX_FAILED_ATTEMPTS }, (_, i) => minutesAgo(i + 1));
    const state = evaluateLockout(failures, now);
    expect(state.locked).toBe(true);
    expect(state.attemptsRemaining).toBe(0);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('ignores failures older than the window', () => {
    const stale = Array.from({ length: 20 }, (_, i) => minutesAgo(60 + i));
    expect(evaluateLockout(stale, now).locked).toBe(false);
  });

  it('lets the lock expire', () => {
    const failures = Array.from({ length: MAX_FAILED_ATTEMPTS }, () => minutesAgo(14));
    const later = new Date(now.getTime() + 30 * 60_000);
    expect(evaluateLockout(failures, later).locked).toBe(false);
  });

  it('does not let continued attempts extend the lock indefinitely', () => {
    // Measuring the lock from the newest failure would hand an attacker a
    // permanent denial-of-service against the real account holder.
    const tripping = Array.from({ length: MAX_FAILED_ATTEMPTS }, () => minutesAgo(14));
    const plusMore = [...tripping, minutesAgo(0), minutesAgo(0)];

    const at = new Date(now.getTime() + 2 * 60_000);
    const state = evaluateLockout(plusMore, at);
    expect(state.locked).toBe(false);
  });

  it('is empty-safe', () => {
    expect(evaluateLockout([], now).locked).toBe(false);
  });
});

describe('refresh evaluation', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  function session(overrides: Partial<Session> = {}): Session {
    return {
      id: 's1',
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'hash',
      issuedAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 60_000),
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null,
      userAgent: null,
      ipAddress: null,
      ...overrides,
    };
  }

  it('accepts a live session', () => {
    expect(evaluateRefresh(session(), now).kind).toBe('ok');
  });

  it('rejects an unknown token', () => {
    expect(evaluateRefresh(null, now).kind).toBe('not_found');
  });

  it('rejects an expired session', () => {
    const expired = session({ expiresAt: new Date(now.getTime() - 1) });
    expect(evaluateRefresh(expired, now).kind).toBe('expired');
  });

  it('flags replay of a rotated token as reuse', () => {
    // The attack signature: a token that was already exchanged comes back.
    const rotated = session({ revokedAt: new Date(now.getTime() - 1), revokedReason: 'rotated' });
    const outcome = evaluateRefresh(rotated, now);

    expect(outcome.kind).toBe('reuse_detected');
    if (outcome.kind === 'reuse_detected') {
      expect(outcome.familyId).toBe('f1');
      expect(outcome.userId).toBe('u1');
    }
  });

  it('treats a logged-out token as merely revoked, not as an attack', () => {
    // Tearing down the family here would add nothing: the user already ended
    // the session themselves.
    const loggedOut = session({ revokedAt: new Date(now.getTime() - 1), revokedReason: 'logout' });
    expect(evaluateRefresh(loggedOut, now).kind).toBe('revoked');
  });
});
