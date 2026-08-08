/** Identity and session types. Plain data, no framework. */

export type UserStatus = 'active' | 'locked' | 'pending_deletion';

export interface User {
  id: string;
  /** Always lowercase — see normalizeEmail. */
  email: string;
  /** Argon2id encoded string. Never leaves the server. */
  passwordHash: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  createdAt: Date;
  deletedAt: Date | null;
}

/** A user as it may be sent to a client. No hash, ever. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

export type RevokedReason = 'rotated' | 'logout' | 'logout_all' | 'reuse_detected' | 'admin';

export interface Session {
  id: string;
  userId: string;
  /**
   * Groups a refresh token with its successors. Rotation keeps the family id;
   * detecting reuse revokes the whole family at once.
   */
  familyId: string;
  /** SHA-256 of the refresh token. The token itself is never stored. */
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: RevokedReason | null;
  userAgent: string | null;
  ipAddress: string | null;
}

/** A session as shown in "your devices". No token hash. */
export interface PublicSession {
  id: string;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  /** True for the session making the request, so the UI can say "this device". */
  current: boolean;
}

export type AuthEventKind =
  | 'register'
  | 'login'
  | 'logout'
  | 'logout_all'
  | 'refresh'
  | 'refresh_reuse_detected'
  | 'session_revoked'
  | 'password_changed'
  | 'account_locked'
  | 'account_deletion_requested'
  | 'account_deletion_cancelled'
  | 'email_verification_sent'
  | 'email_verified'
  | 'password_reset_requested'
  | 'password_reset_completed';

export interface AuthEvent {
  id: string;
  userId: string | null;
  /** Recorded even when no user matches, so failures against unknown
   *  addresses still count toward lockout. */
  emailAttempted: string | null;
  kind: AuthEventKind;
  succeeded: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  detail: string | null;
  createdAt: Date;
}

/** What the access token carries. Deliberately minimal: anything in here is
 *  readable by whoever holds the token and cannot be revoked before it expires. */
export interface AccessTokenClaims {
  sub: string;
  /** Session id, so a revoked session can be rejected if we ever add a check. */
  sid: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  tokenType: 'Bearer';
}
