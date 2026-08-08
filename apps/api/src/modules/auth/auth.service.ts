import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { evaluateLockout, FAILURE_WINDOW_MS } from '../../domain/auth/lockout';
import {
  checkPassword,
  isValidEmail,
  normalizeEmail,
} from '../../domain/auth/password-policy';
import { evaluateRefresh } from '../../domain/auth/session';
import {
  toPublicUser,
  type AuthEvent,
  type AuthEventKind,
  type PublicSession,
  type PublicUser,
  type Session,
  type TokenPair,
  type User,
} from '../../domain/auth/types';
import { REFRESH_TOKEN_TTL_MS } from '../../infra/auth/jwt-issuer';
import { CLOCK, type ClockPort } from '../../ports';
import {
  AUTH_EVENT_STORE,
  DuplicateEmailError,
  PASSWORD_HASHER,
  SESSION_STORE,
  TOKEN_ISSUER,
  USER_STORE,
  type AuthEventStore,
  type PasswordHasher,
  type SessionStore,
  type TokenIssuer,
  type UserStore,
} from '../../ports/auth';

/** Where the request came from, for the audit trail and the device list. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_EVENT_STORE) private readonly events: AuthEventStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  // ------------------------------------------------------------- register

  async register(
    email: string,
    password: string,
    displayName: string | null,
    context: RequestContext,
  ): Promise<AuthResult> {
    const normalized = normalizeEmail(email);

    if (!isValidEmail(normalized)) {
      throw new BadRequestException('Enter a valid email address.');
    }

    const check = checkPassword(password, normalized);
    if (!check.ok) {
      throw new BadRequestException({ message: 'Password rejected.', problems: check.problems });
    }

    const passwordHash = await this.hasher.hash(password);

    let user: User;
    try {
      user = await this.users.create({
        id: randomUUID(),
        email: normalized,
        passwordHash,
        displayName: displayName?.trim() || null,
      });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        await this.record('register', false, null, normalized, context, 'duplicate email');
        // Deliberately the same shape as a successful-looking rejection would be
        // — but registration genuinely cannot hide this, since the account
        // either gets created or does not. Enumeration here is mitigated by
        // rate limiting rather than by lying about the outcome.
        throw new HttpException('An account with that email already exists.', HttpStatus.CONFLICT);
      }
      throw error;
    }

    await this.record('register', true, user.id, normalized, context, null);

    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  // ---------------------------------------------------------------- login

  async login(email: string, password: string, context: RequestContext): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    const now = this.clock.now();

    const failures = await this.events.recentFailures(
      normalized,
      new Date(now.getTime() - FAILURE_WINDOW_MS),
    );
    const lockout = evaluateLockout(failures, now);

    if (lockout.locked) {
      await this.record('login', false, null, normalized, context, 'locked out');
      throw new HttpException(
        {
          message: 'Too many failed attempts. Try again later.',
          retryAfterSeconds: lockout.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users.findByEmail(normalized);

    // Always do the hashing work, so a request for a non-existent account costs
    // the same as one for a real account. Response time alone would otherwise
    // enumerate which addresses are registered.
    const passwordOk = user
      ? await this.hasher.verify(user.passwordHash, password)
      : await this.hasher.verify(await this.decoyHash(), password);

    if (!user || !passwordOk) {
      await this.record('login', false, user?.id ?? null, normalized, context, 'bad credentials');
      // One message for both cases. "No such user" versus "wrong password" is a
      // free account-enumeration oracle.
      throw new UnauthorizedException('Incorrect email or password.');
    }

    if (user.status !== 'active') {
      await this.record('login', false, user.id, normalized, context, `status=${user.status}`);
      throw new ForbiddenException('This account is not available. Contact support.');
    }

    // The one moment the plaintext exists — upgrade a hash made under weaker
    // parameters while we can.
    if (this.hasher.needsRehash(user.passwordHash)) {
      const upgraded = await this.hasher.hash(password);
      await this.users.updatePasswordHash(user.id, upgraded);
      this.logger.log(`Upgraded password hash parameters for user ${user.id}`);
    }

    await this.record('login', true, user.id, normalized, context, null);

    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  // -------------------------------------------------------------- refresh

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthResult> {
    const now = this.clock.now();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    const outcome = evaluateRefresh(session, now);

    if (outcome.kind === 'reuse_detected') {
      // A rotated token came back. Either it was captured in transit or lifted
      // from storage. Revoking the whole family logs out the attacker and the
      // legitimate user together; a forced re-login is the cheaper harm.
      const revoked = await this.sessions.revokeFamily(outcome.familyId, 'reuse_detected', now);
      await this.record(
        'refresh_reuse_detected',
        false,
        outcome.userId,
        null,
        context,
        `revoked ${revoked} session(s) in family ${outcome.familyId}`,
      );
      this.logger.warn(
        `Refresh token reuse detected for user ${outcome.userId}; revoked ${revoked} session(s)`,
      );
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }

    if (outcome.kind !== 'ok') {
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }

    const user = await this.users.findById(outcome.session.userId);
    if (!user || user.status !== 'active') {
      await this.sessions.revoke(outcome.session.id, 'admin', now);
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }

    // Rotate: the presented token is spent, and its successor joins the family.
    await this.sessions.revoke(outcome.session.id, 'rotated', now);
    await this.record('refresh', true, user.id, null, context, null);

    return {
      user: toPublicUser(user),
      tokens: await this.issueSession(user, outcome.session.familyId, context),
    };
  }

  // --------------------------------------------------------------- logout

  async logout(userId: string, sessionId: string, context: RequestContext): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout', this.clock.now());
    await this.record('logout', true, userId, null, context, null);
  }

  async logoutAll(userId: string, context: RequestContext): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(userId, 'logout_all', this.clock.now());
    await this.record('logout_all', true, userId, null, context, `revoked ${revoked}`);
    return { revoked };
  }

  // ------------------------------------------------------------- sessions

  async listSessions(userId: string, currentSessionId: string): Promise<PublicSession[]> {
    const sessions = await this.sessions.listActive(userId);
    return sessions.map((session) => ({
      id: session.id,
      issuedAt: session.issuedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, context: RequestContext): Promise<void> {
    // Scoped by userId, so one user cannot end another user's session by
    // guessing an id.
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new NotFoundException('No such session.');

    await this.sessions.revoke(sessionId, 'admin', this.clock.now());
    await this.record('session_revoked', true, userId, null, context, `session ${sessionId}`);
  }

  async currentUser(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    return toPublicUser(user);
  }

  /** Used by the guard. Verifies signature, then confirms the session still exists. */
  async resolveAccessToken(
    token: string,
  ): Promise<{ userId: string; sessionId: string } | null> {
    const claims = this.tokens.verifyAccessToken(token);
    if (!claims) return null;

    // Signature alone is not enough. Without this check a revoked session keeps
    // working until its access token expires, so "log out everywhere" would be
    // a promise the API does not keep.
    const session = await this.sessions.findById(claims.userId, claims.sessionId);
    if (!session || session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= this.clock.now().getTime()) return null;

    return claims;
  }

  // -------------------------------------------------------------- helpers

  private decoyHashPromise: Promise<string> | null = null;

  /**
   * A real Argon2id hash of a random secret nobody holds.
   *
   * It must be genuinely well-formed: verifying against a malformed string
   * fails to parse and returns almost immediately, which would leave exactly
   * the timing gap this exists to close. Computed once per process and reused —
   * the point is to spend the same time as a real verify, not to be unique.
   */
  private decoyHash(): Promise<string> {
    this.decoyHashPromise ??= this.hasher.hash(randomUUID() + randomUUID());
    return this.decoyHashPromise;
  }

  private async issueSession(
    user: User,
    familyId: string | null,
    context: RequestContext,
  ): Promise<TokenPair> {
    const now = this.clock.now();
    const sessionId = randomUUID();
    const { token: refreshToken, tokenHash } = this.tokens.generateRefreshToken();

    const session: Session = {
      id: sessionId,
      userId: user.id,
      familyId: familyId ?? randomUUID(),
      tokenHash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    };

    await this.sessions.create(session);

    const access = this.tokens.signAccessToken(user.id, sessionId);

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      refreshExpiresAt: session.expiresAt.toISOString(),
      tokenType: 'Bearer',
    };
  }

  private async record(
    kind: AuthEventKind,
    succeeded: boolean,
    userId: string | null,
    emailAttempted: string | null,
    context: RequestContext,
    detail: string | null,
  ): Promise<void> {
    const event: AuthEvent = {
      id: randomUUID(),
      userId,
      emailAttempted,
      kind,
      succeeded,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      detail,
      createdAt: this.clock.now(),
    };

    try {
      await this.events.record(event);
    } catch (error) {
      // Audit logging must never break the request it is describing, but a
      // silent failure would leave a blind spot in the security trail.
      this.logger.error(`Failed to record auth event ${kind}`, error as Error);
    }
  }
}
