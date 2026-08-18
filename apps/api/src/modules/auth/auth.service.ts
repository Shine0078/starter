import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { evaluateLockout, FAILURE_WINDOW_MS } from '../../domain/auth/lockout';
import {
  checkPassword,
  isValidEmail,
  normalizeEmail,
} from '../../domain/auth/password-policy';
import { evaluateRefresh } from '../../domain/auth/session';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../domain/auth/totp';
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
import { loadConfig } from '../../config';
import { CLOCK, type ClockPort } from '../../ports';
import {
  BANK_ACCOUNT_REVOKER,
  type BankAccountRevoker,
} from '../../ports/banking';
import {
  ACCOUNT_DELETION_STORE,
  AUTH_ACTION_TOKEN_STORE,
  AUTH_EVENT_STORE,
  EMAIL_SENDER,
  DuplicateEmailError,
  PASSWORD_BREACH_CHECKER,
  PASSWORD_HASHER,
  REGISTRATION_STORE,
  MFA_SECRET_CIPHER,
  MFA_STORE,
  SESSION_STORE,
  TOKEN_ISSUER,
  USER_STORE,
  type AccountDeletionStore,
  type AuthActionKind,
  type AuthActionTokenStore,
  type AuthEventStore,
  type EmailSender,
  type PasswordBreachChecker,
  type PasswordHasher,
  type RegistrationStore,
  type MfaSecretCipher,
  type MfaStore,
  type SessionStore,
  type TokenIssuer,
  type UserStore,
} from '../../ports/auth';
import type { ConsentEvent } from '../../ports/privacy';

/** Where the request came from, for the audit trail and the device list. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

export interface LegalAcceptanceInput {
  acceptedTerms: boolean;
  termsVersion: string | null;
  acceptedPrivacyNotice: boolean;
  privacyVersion: string | null;
}

export interface MfaRequiredResult {
  mfaRequired: true;
  challengeToken: string;
  expiresAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(REGISTRATION_STORE) private readonly registrations: RegistrationStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_EVENT_STORE) private readonly events: AuthEventStore,
    @Inject(ACCOUNT_DELETION_STORE) private readonly deletions: AccountDeletionStore,
    @Inject(AUTH_ACTION_TOKEN_STORE) private readonly actionTokens: AuthActionTokenStore,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_BREACH_CHECKER) private readonly passwordBreachChecker: PasswordBreachChecker,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(MFA_STORE) private readonly mfa: MfaStore,
    @Inject(MFA_SECRET_CIPHER) private readonly mfaCipher: MfaSecretCipher,
    @Inject(BANK_ACCOUNT_REVOKER) private readonly bankRevoker: BankAccountRevoker,
  ) {}

  // ------------------------------------------------------------- register

  async register(
    email: string,
    password: string,
    displayName: string | null,
    legalAcceptance: LegalAcceptanceInput,
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
    await this.assertPasswordNotCompromised(password);

    const legal = loadConfig().legal;
    if (
      legal.registrationRequired &&
      (!legalAcceptance.acceptedTerms ||
        legalAcceptance.termsVersion !== legal.terms!.version ||
        !legalAcceptance.acceptedPrivacyNotice ||
        legalAcceptance.privacyVersion !== legal.privacyNotice!.version)
    ) {
      throw new BadRequestException(
        'Accept the current Terms of Service and Privacy Notice to create an account.',
      );
    }

    const passwordHash = await this.hasher.hash(password);

    const userId = randomUUID();
    const acceptedAt = this.clock.now();
    const legalEvents: ConsentEvent[] = legal.registrationRequired
      ? [
          {
            id: randomUUID(),
            userId,
            kind: 'terms',
            granted: true,
            policyVersion: legal.terms!.version,
            source: 'registration',
            createdAt: acceptedAt,
          },
          {
            id: randomUUID(),
            userId,
            kind: 'privacy_notice',
            granted: true,
            policyVersion: legal.privacyNotice!.version,
            source: 'registration',
            createdAt: acceptedAt,
          },
        ]
      : [];

    let user: User;
    try {
      user = await this.registrations.create(
        {
          id: userId,
          email: normalized,
          passwordHash,
          displayName: displayName?.trim() || null,
        },
        legalEvents,
      );
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

    try {
      await this.issueAuthAction(user, 'verify_email');
      await this.record('email_verification_sent', true, user.id, user.email, context, null);
    } catch (error) {
      this.logger.error(`Failed to issue verification email for ${user.id}`, error as Error);
      await this.record(
        'email_verification_sent',
        false,
        user.id,
        user.email,
        context,
        'delivery failed',
      );
    }

    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  // ---------------------------------------------------------------- login

  async login(email: string, password: string, context: RequestContext): Promise<AuthResult | MfaRequiredResult> {
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

    const mfa = await this.mfa.get(user.id);
    if (mfa?.enabledAt) {
      const challengeToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1_000);
      await this.mfa.createChallenge(this.hashOpaque(challengeToken), user.id, expiresAt, now);
      await this.record('mfa_challenge', true, user.id, normalized, context, 'password verified');
      return { mfaRequired: true, challengeToken, expiresAt: expiresAt.toISOString() };
    }

    await this.record('login', true, user.id, normalized, context, null);

    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  /** Completes login after a verified WebAuthn assertion. */
  async assertPasskeyNotLocked(email: string | null, context: RequestContext): Promise<void> {
    if (!email) return;
    const now = this.clock.now();
    const failures = await this.events.recentFailures(
      email,
      new Date(now.getTime() - FAILURE_WINDOW_MS),
      'passkey_login',
    );
    const lockout = evaluateLockout(failures, now);
    if (!lockout.locked) return;
    await this.record('passkey_login', false, null, email, context, 'locked out');
    throw new HttpException(
      {
        message: 'Too many failed attempts. Try again later.',
        retryAfterSeconds: lockout.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async loginWithVerifiedPasskey(userId: string, context: RequestContext): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    await this.assertPasskeyNotLocked(user?.email ?? null, context);
    if (!user || user.status !== 'active') {
      await this.record(
        'passkey_login',
        false,
        userId,
        user?.email ?? null,
        context,
        user ? `status=${user.status}` : 'missing user',
      );
      throw new UnauthorizedException('This passkey could not be verified.');
    }
    await this.record('passkey_login', true, user.id, user.email, context, null);
    await this.record('login', true, user.id, user.email, context, 'passkey');
    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  async requireRecentPassword(
    userId: string,
    password: string,
    mfaCode: string | undefined,
    context: RequestContext,
  ): Promise<User> {
    const user = await this.requirePassword(userId, password);
    const mfa = await this.mfa.get(user.id);
    if (mfa?.enabledAt) {
      if (!mfaCode || !(await this.verifyMfaFactor(user.id, mfaCode, this.clock.now()))) {
        await this.record('passkey_step_up', false, user.id, user.email, context, 'second factor failed');
        throw new UnauthorizedException('Authenticator or recovery code is incorrect.');
      }
    }
    return user;
  }

  recordAuthEvent(
    kind: AuthEventKind,
    succeeded: boolean,
    userId: string | null,
    emailAttempted: string | null,
    context: RequestContext,
    detail: string | null,
  ): Promise<void> {
    return this.record(kind, succeeded, userId, emailAttempted, context, detail);
  }

  async notifyPasskeyChange(email: string, action: 'added' | 'removed'): Promise<void> {
    const subject =
      action === 'added' ? 'A passkey was added to your FINVERSE account' : 'A passkey was removed from your FINVERSE account';
    const body =
      action === 'added'
        ? 'A new passkey was added to your FINVERSE account. If you did not do this, sign in and remove it immediately.'
        : 'A passkey was removed from your FINVERSE account. If you did not do this, reset your password and review your sign-in methods.';
    try {
      await this.emailSender.sendSecurityNotice?.(email, subject, body);
    } catch (error) {
      this.logger.error(`Failed to send passkey ${action} notice`, error as Error);
    }
  }

  // ------------------------------------------------------ multi-factor auth

  async mfaStatus(userId: string): Promise<{ enabled: boolean; available: boolean; recoveryCodesRemaining: number }> {
    const record = await this.mfa.get(userId);
    const enabled = record?.enabledAt != null;
    return {
      enabled,
      available: this.mfaCipher.available,
      recoveryCodesRemaining: enabled ? await this.mfa.recoveryCodesRemaining(userId) : 0,
    };
  }

  async enrollMfa(userId: string, password: string, context: RequestContext): Promise<{ secret: string; otpauthUri: string }> {
    if (!this.mfaCipher.available) {
      throw new HttpException('Authenticator security is not configured on this server.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const user = await this.requirePassword(userId, password);
    const current = await this.mfa.get(user.id);
    if (current?.enabledAt) throw new BadRequestException('Authenticator security is already enabled.');
    const secret = generateTotpSecret();
    await this.mfa.savePending(user.id, this.mfaCipher.encrypt(secret), this.clock.now());
    await this.record('mfa_enrolled', true, user.id, user.email, context, 'enrollment started');
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  async enableMfa(userId: string, code: string, context: RequestContext): Promise<{ enabled: true; recoveryCodes: string[] }> {
    const user = await this.users.findById(userId);
    const record = await this.mfa.get(userId);
    if (!user || user.status !== 'active' || !record || record.enabledAt) {
      throw new BadRequestException('Start authenticator setup again.');
    }
    const secret = this.decryptMfaSecret(record.encryptedSecret);
    if (verifyTotp(secret, code.trim(), this.clock.now()) === null) {
      await this.record('mfa_enrolled', false, user.id, user.email, context, 'invalid confirmation code');
      throw new UnauthorizedException('Authenticator code is incorrect.');
    }
    const recoveryCodes = Array.from({ length: 10 }, () => this.generateRecoveryCode());
    const enabled = await this.mfa.enable(user.id, recoveryCodes.map((value) => this.hashRecoveryCode(value)), this.clock.now());
    if (!enabled) throw new BadRequestException('Start authenticator setup again.');
    await this.record('mfa_enrolled', true, user.id, user.email, context, 'enabled');
    return { enabled: true, recoveryCodes };
  }

  async verifyMfaChallenge(challengeToken: string, code: string, context: RequestContext): Promise<AuthResult> {
    const now = this.clock.now();
    const tokenHash = this.hashOpaque(challengeToken);
    const challenge = await this.mfa.findChallenge(tokenHash, now);
    if (!challenge) throw new UnauthorizedException('This sign-in challenge is invalid or expired.');
    const user = await this.users.findById(challenge.userId);
    if (!user || user.status !== 'active' || !(await this.verifyMfaFactor(user.id, code, now))) {
      const remaining = await this.mfa.failChallenge(tokenHash, now);
      await this.record('mfa_verified', false, user?.id ?? challenge.userId, user?.email ?? null, context, 'invalid second factor');
      throw new UnauthorizedException(
        remaining === 0
          ? 'Too many incorrect codes. Sign in again.'
          : 'Authenticator or recovery code is incorrect.',
      );
    }
    if (!(await this.mfa.consumeChallenge(tokenHash, now))) {
      throw new UnauthorizedException('This sign-in challenge is invalid or expired.');
    }
    await this.record('mfa_verified', true, user.id, user.email, context, null);
    await this.record('login', true, user.id, user.email, context, 'MFA verified');
    return { user: toPublicUser(user), tokens: await this.issueSession(user, null, context) };
  }

  async disableMfa(userId: string, password: string, code: string, context: RequestContext): Promise<{ enabled: false }> {
    const user = await this.requirePassword(userId, password);
    if (!(await this.verifyMfaFactor(user.id, code, this.clock.now()))) {
      await this.record('mfa_disabled', false, user.id, user.email, context, 'invalid second factor');
      throw new UnauthorizedException('Authenticator or recovery code is incorrect.');
    }
    await this.mfa.disable(user.id);
    await this.record('mfa_disabled', true, user.id, user.email, context, null);
    return { enabled: false };
  }

  // ---------------------------------------------------- account deletion

  async requestAccountDeletion(
    userId: string,
    password: string,
    context: RequestContext,
  ): Promise<{ purgeScheduledFor: string }> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }

    if (!(await this.hasher.verify(user.passwordHash, password))) {
      await this.record(
        'account_deletion_requested',
        false,
        user.id,
        user.email,
        context,
        'password re-verification failed',
      );
      throw new UnauthorizedException('Password is incorrect.');
    }

    // Revoke provider Items before disabling the account. Deleting our local
    // row alone would leave a Plaid Item able to pull new financial data during
    // the 30-day recovery window, which contradicts the user's erasure request.
    // The revoker is idempotent and treats already-removed Items as complete.
    try {
      await this.bankRevoker.revokeAll(user.id);
    } catch (error) {
      await this.record(
        'account_deletion_requested',
        false,
        user.id,
        user.email,
        context,
        error instanceof Error ? error.message : 'bank access revocation failed',
      );
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : 'Bank access could not be revoked. Try again shortly.',
      );
    }

    const requestedAt = this.clock.now();
    const purgeAfter = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
    await this.deletions.request(user.id, user.email, requestedAt, purgeAfter);
    await this.sessions.revokeAllForUser(user.id, 'admin', requestedAt);
    await this.record(
      'account_deletion_requested',
      true,
      user.id,
      user.email,
      context,
      `purge scheduled for ${purgeAfter.toISOString()}`,
    );
    return { purgeScheduledFor: purgeAfter.toISOString() };
  }

  async cancelAccountDeletion(
    email: string,
    password: string,
    context: RequestContext,
  ): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    const passwordOk = user
      ? await this.hasher.verify(user.passwordHash, password)
      : await this.hasher.verify(await this.decoyHash(), password);

    if (!user || !passwordOk || user.status !== 'pending_deletion') {
      await this.record(
        'account_deletion_cancelled',
        false,
        user?.id ?? null,
        normalized,
        context,
        'bad credentials or deletion not pending',
      );
      throw new UnauthorizedException('Incorrect email or password.');
    }

    await this.deletions.cancel(user.id);
    const restored = { ...user, status: 'active' as const };
    await this.record('account_deletion_cancelled', true, user.id, normalized, context, null);
    return {
      user: toPublicUser(restored),
      tokens: await this.issueSession(restored, null, context),
    };
  }

  // ------------------------------------------ verification and recovery

  async requestEmailVerification(
    userId: string,
    context: RequestContext,
  ): Promise<{ accepted: true }> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }
    if (user.emailVerifiedAt === null) {
      await this.issueAuthAction(user, 'verify_email');
      await this.record('email_verification_sent', true, user.id, user.email, context, null);
    }
    return { accepted: true };
  }

  async confirmEmailVerification(
    token: string,
    context: RequestContext,
  ): Promise<{ verified: true }> {
    const now = this.clock.now();
    const userId = await this.actionTokens.consume(
      'verify_email',
      this.hashActionToken(token),
      now,
    );
    if (!userId) throw new BadRequestException('This verification link is invalid or expired.');

    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new BadRequestException('This verification link is invalid or expired.');
    }
    await this.users.markEmailVerified(user.id, now);
    await this.record('email_verified', true, user.id, user.email, context, null);
    return { verified: true };
  }

  async requestPasswordReset(
    email: string,
    context: RequestContext,
  ): Promise<{ accepted: true }> {
    const normalized = normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    if (user?.status === 'active') {
      await this.issueAuthAction(user, 'reset_password');
      await this.record('password_reset_requested', true, user.id, normalized, context, null);
    } else {
      // The response remains identical, but the attempt is still useful for
      // abuse detection. Do not name account existence in the detail.
      await this.record('password_reset_requested', false, null, normalized, context, null);
    }
    return { accepted: true };
  }

  async confirmPasswordReset(
    token: string,
    password: string,
    context: RequestContext,
  ): Promise<{ reset: true }> {
    const check = checkPassword(password);
    if (!check.ok) {
      throw new BadRequestException({ message: 'Password rejected.', problems: check.problems });
    }
    await this.assertPasswordNotCompromised(password);

    const now = this.clock.now();
    const userId = await this.actionTokens.consume(
      'reset_password',
      this.hashActionToken(token),
      now,
    );
    if (!userId) throw new BadRequestException('This reset link is invalid or expired.');

    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new BadRequestException('This reset link is invalid or expired.');
    }
    await this.users.updatePasswordHash(user.id, await this.hasher.hash(password));
    await this.sessions.revokeAllForUser(user.id, 'admin', now);
    await this.record('password_reset_completed', true, user.id, user.email, context, null);
    return { reset: true };
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

    // Rotate in one store operation. A mobile dashboard can have several
    // requests discover an expired access token at once; a read-then-revoke
    // sequence would let two requests spend the same refresh token and create
    // competing successors.
    const successor = this.buildSession(user, outcome.session.familyId, context);
    const rotated = await this.sessions.rotate(outcome.session.id, successor.session, now);
    if (!rotated) {
      const current = await this.sessions.findByTokenHash(tokenHash);
      const replay = evaluateRefresh(current, now);
      if (replay.kind === 'reuse_detected') {
        const revoked = await this.sessions.revokeFamily(replay.familyId, 'reuse_detected', now);
        await this.record(
          'refresh_reuse_detected',
          false,
          replay.userId,
          null,
          context,
          `revoked ${revoked} session(s) in family ${replay.familyId}`,
        );
      }
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }
    await this.record('refresh', true, user.id, null, context, null);

    return {
      user: toPublicUser(user),
      tokens: successor.tokens,
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

  /** Password step-up for opening or reconnecting a financial-data source. */
  async verifyBankLinkStepUp(
    userId: string,
    password: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    }
    const verified = await this.hasher.verify(user.passwordHash, password);
    await this.record(
      'bank_link_step_up',
      verified,
      user.id,
      user.email,
      context,
      verified ? null : 'password re-verification failed',
    );
    if (!verified) throw new UnauthorizedException('Password is incorrect.');
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

    const user = await this.users.findById(claims.userId);
    if (!user || user.status !== 'active') return null;

    return claims;
  }

  // -------------------------------------------------------------- helpers

  private decoyHashPromise: Promise<string> | null = null;

  private async issueAuthAction(user: User, kind: AuthActionKind): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const lifetime = kind === 'verify_email' ? 24 * 60 * 60 * 1_000 : 60 * 60 * 1_000;
    await this.actionTokens.issue(
      user.id,
      kind,
      this.hashActionToken(token),
      new Date(this.clock.now().getTime() + lifetime),
    );
    await this.emailSender.sendAction(user.email, kind, token);
  }

  private hashActionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashOpaque(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashRecoveryCode(value: string): string {
    return this.hashOpaque(value.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  }

  private generateRecoveryCode(): string {
    return randomBytes(10).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-');
  }

  private decryptMfaSecret(ciphertext: string): string {
    try { return this.mfaCipher.decrypt(ciphertext); }
    catch (error) {
      this.logger.error('Could not decrypt an MFA secret.', error as Error);
      throw new HttpException('Authenticator security is temporarily unavailable.', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private async verifyMfaFactor(userId: string, candidate: string, at: Date): Promise<boolean> {
    const record = await this.mfa.get(userId);
    if (!record?.enabledAt) return false;
    const normalized = candidate.trim();
    if (/^\d{6}$/.test(normalized)) {
      const step = verifyTotp(this.decryptMfaSecret(record.encryptedSecret), normalized, at);
      return step !== null && this.mfa.acceptTotpStep(userId, step);
    }
    return this.mfa.consumeRecoveryCode(userId, this.hashRecoveryCode(normalized), at);
  }

  private async assertPasswordNotCompromised(password: string): Promise<void> {
    const result = await this.passwordBreachChecker.check(password);
    if (result.kind === 'compromised') {
      throw new BadRequestException({
        message: 'Password rejected.',
        problems: [
          'This password appears in known data breaches. Choose a new, unique passphrase.',
        ],
      });
    }
    if (result.kind === 'unavailable' && this.passwordBreachChecker.required) {
      throw new ServiceUnavailableException(
        'Password safety screening is temporarily unavailable. Try again shortly.',
      );
    }
    if (result.kind === 'unavailable') {
      // Best-effort development mode never sends candidate values to the log.
      this.logger.warn('Compromised-password screening was unavailable.');
    }
  }

  private async requirePassword(userId: string, password: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') throw new UnauthorizedException('Session is no longer valid. Sign in again.');
    if (!(await this.hasher.verify(user.passwordHash, password))) throw new UnauthorizedException('Password is incorrect.');
    return user;
  }

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
    const issued = this.buildSession(user, familyId, context);
    await this.sessions.create(issued.session);
    return issued.tokens;
  }

  private buildSession(
    user: User,
    familyId: string | null,
    context: RequestContext,
  ): { session: Session; tokens: TokenPair } {
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

    const access = this.tokens.signAccessToken(user.id, sessionId);

    return {
      session,
      tokens: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        refreshToken,
        refreshExpiresAt: session.expiresAt.toISOString(),
        tokenType: 'Bearer',
      },
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
