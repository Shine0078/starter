/**
 * Ports for identity. Same rule as the financial stores (ADR-0002): the domain
 * and the auth service declare what they need, `infra/` supplies it.
 *
 * Hashing and token signing are ports rather than direct imports because both
 * are infrastructure — one is a native binary, the other holds a signing key —
 * and because tests need to substitute fast fakes. Argon2 is slow *by design*;
 * a suite that hashes for real on every fixture takes minutes.
 */

import type { AuthEvent, Session, User } from '../domain/auth/types';

export const USER_STORE = 'USER_STORE';
export const SESSION_STORE = 'SESSION_STORE';
export const AUTH_EVENT_STORE = 'AUTH_EVENT_STORE';
export const PASSWORD_HASHER = 'PASSWORD_HASHER';
export const TOKEN_ISSUER = 'TOKEN_ISSUER';

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export interface UserStore {
  /** `email` must already be normalised to lowercase. */
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Rejects on a duplicate email; the unique index is the arbiter, not a
   *  prior read, so two simultaneous registrations cannot both succeed. */
  create(input: CreateUserInput): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  setStatus(userId: string, status: User['status']): Promise<void>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

export interface SessionStore {
  create(session: Session): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  findById(userId: string, sessionId: string): Promise<Session | null>;
  /** Active sessions only, newest first. Powers the "your devices" list. */
  listActive(userId: string): Promise<Session[]>;
  revoke(sessionId: string, reason: Session['revokedReason'], at: Date): Promise<void>;
  /** Revokes every session in a family. The response to a replayed token. */
  revokeFamily(familyId: string, reason: Session['revokedReason'], at: Date): Promise<number>;
  revokeAllForUser(userId: string, reason: Session['revokedReason'], at: Date): Promise<number>;
  touch(sessionId: string, at: Date): Promise<void>;
  /** Housekeeping: drop rows that are expired and revoked. */
  deleteExpired(before: Date): Promise<number>;
}

export interface AuthEventStore {
  record(event: AuthEvent): Promise<void>;
  /** Failure timestamps for one address inside a window — feeds evaluateLockout. */
  recentFailures(email: string, since: Date): Promise<Date[]>;
  listForUser(userId: string, limit: number): Promise<AuthEvent[]>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Must be constant-time with respect to the password. */
  verify(hash: string, password: string): Promise<boolean>;
  /**
   * True when `hash` was produced with parameters weaker than current policy,
   * so it can be transparently upgraded on the next successful login.
   */
  needsRehash(hash: string): boolean;
}

export interface TokenIssuer {
  signAccessToken(userId: string, sessionId: string): { token: string; expiresIn: number };
  /** Returns null for any invalid, expired, or tampered token — never throws. */
  verifyAccessToken(token: string): { userId: string; sessionId: string } | null;
  /** A fresh high-entropy refresh token plus the SHA-256 stored alongside it. */
  generateRefreshToken(): { token: string; tokenHash: string };
  hashRefreshToken(token: string): string;
}
