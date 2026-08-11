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
import type { ConsentEvent } from './privacy';

export const USER_STORE = 'USER_STORE';
export const SESSION_STORE = 'SESSION_STORE';
export const AUTH_EVENT_STORE = 'AUTH_EVENT_STORE';
export const ACCOUNT_DELETION_STORE = 'ACCOUNT_DELETION_STORE';
export const AUTH_ACTION_TOKEN_STORE = 'AUTH_ACTION_TOKEN_STORE';
export const EMAIL_SENDER = 'EMAIL_SENDER';
export const PASSWORD_HASHER = 'PASSWORD_HASHER';
export const TOKEN_ISSUER = 'TOKEN_ISSUER';
export const REGISTRATION_STORE = 'REGISTRATION_STORE';
export const MFA_STORE = 'MFA_STORE';
export const MFA_SECRET_CIPHER = 'MFA_SECRET_CIPHER';
export const PASSWORD_BREACH_CHECKER = 'PASSWORD_BREACH_CHECKER';

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
  markEmailVerified(userId: string, at: Date): Promise<void>;
}

export interface RegistrationStore {
  /** Atomically creates the user and immutable legal-acceptance evidence. */
  create(input: CreateUserInput, consents: ConsentEvent[]): Promise<User>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

export interface SessionStore {
  create(session: Session): Promise<Session>;
  /**
   * Atomically spends one live refresh session and inserts its successor.
   * Returns false when another request already spent the old session.
   */
  rotate(sessionId: string, successor: Session, at: Date): Promise<boolean>;
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

export interface AccountDeletionStore {
  /** Begins the recovery window and makes the account unusable immediately. */
  request(userId: string, email: string, requestedAt: Date, purgeAfter: Date): Promise<void>;
  /** Restores an account during its recovery window. */
  cancel(userId: string): Promise<void>;
  /** Permanently removes every account whose recovery window has elapsed. */
  purgeDue(asOf: Date): Promise<number>;
}

export type AuthActionKind = 'verify_email' | 'reset_password';

export interface AuthActionTokenStore {
  issue(userId: string, kind: AuthActionKind, tokenHash: string, expiresAt: Date): Promise<void>;
  /** Atomically marks a live token used and returns its owner. */
  consume(kind: AuthActionKind, tokenHash: string, at: Date): Promise<string | null>;
}

export interface EmailSender {
  sendAction(email: string, kind: AuthActionKind, token: string): Promise<void>;
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

/**
 * Checks a candidate password against a compromised-password corpus. The
 * adapter receives the plaintext only inside this process; external adapters
 * must use a privacy-preserving protocol such as HIBP's five-character hash
 * range lookup and must never log candidate values.
 */
export interface PasswordBreachChecker {
  /** An unavailable check rejects a new password when this is true. */
  readonly required: boolean;
  check(password: string): Promise<PasswordBreachResult>;
}

export type PasswordBreachResult =
  | { kind: 'safe' }
  | { kind: 'compromised'; occurrences: number }
  | { kind: 'unavailable' };

export interface TokenIssuer {
  signAccessToken(userId: string, sessionId: string): { token: string; expiresIn: number };
  /** Returns null for any invalid, expired, or tampered token — never throws. */
  verifyAccessToken(token: string): { userId: string; sessionId: string } | null;
  /** A fresh high-entropy refresh token plus the SHA-256 stored alongside it. */
  generateRefreshToken(): { token: string; tokenHash: string };
  hashRefreshToken(token: string): string;
}

export interface MfaRecord {
  userId: string;
  encryptedSecret: string;
  enabledAt: Date | null;
  lastUsedStep: number | null;
}

export interface MfaLoginChallenge {
  userId: string;
  expiresAt: Date;
}

export interface MfaStore {
  get(userId: string): Promise<MfaRecord | null>;
  savePending(userId: string, encryptedSecret: string, at: Date): Promise<void>;
  enable(userId: string, recoveryCodeHashes: string[], at: Date): Promise<boolean>;
  disable(userId: string): Promise<void>;
  acceptTotpStep(userId: string, step: number): Promise<boolean>;
  consumeRecoveryCode(userId: string, codeHash: string, at: Date): Promise<boolean>;
  recoveryCodesRemaining(userId: string): Promise<number>;
  createChallenge(tokenHash: string, userId: string, expiresAt: Date, at: Date): Promise<void>;
  findChallenge(tokenHash: string, at: Date): Promise<MfaLoginChallenge | null>;
  /** Records a bad factor and invalidates the challenge after five failures. */
  failChallenge(tokenHash: string, at: Date): Promise<number | null>;
  consumeChallenge(tokenHash: string, at: Date): Promise<boolean>;
  purgeUser(userId: string): void;
}

export interface MfaSecretCipher {
  readonly available: boolean;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
