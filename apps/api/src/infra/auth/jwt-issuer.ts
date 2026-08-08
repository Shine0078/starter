import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import type { TokenIssuer } from '../../ports/auth';

/**
 * Access tokens are short-lived JWTs; refresh tokens are opaque random strings.
 *
 * The asymmetry is deliberate. A JWT is verifiable without a database round
 * trip, which is what makes it cheap on every request — but it also cannot be
 * revoked before it expires, so its lifetime is kept short. The refresh token
 * carries the long-lived authority, is checked against the database on every
 * use, and can therefore be revoked the instant something looks wrong.
 */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ISSUER = 'finverse';
const AUDIENCE = 'finverse-app';

export class JwtTokenIssuer implements TokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
  ) {
    if (!secret || secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters.');
    }
  }

  signAccessToken(userId: string, sessionId: string): { token: string; expiresIn: number } {
    const token = jwt.sign({ sid: sessionId }, this.secret, {
      subject: userId,
      expiresIn: this.accessTtlSeconds,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    });

    return { token, expiresIn: this.accessTtlSeconds };
  }

  verifyAccessToken(token: string): { userId: string; sessionId: string } | null {
    try {
      // `algorithms` is pinned. Without it, a token with alg:none or an
      // attacker-chosen algorithm can be accepted — the classic JWT bypass.
      const payload = jwt.verify(token, this.secret, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });

      if (typeof payload === 'string') return null;

      const userId = payload.sub;
      const sessionId = payload['sid'];
      if (typeof userId !== 'string' || typeof sessionId !== 'string') return null;

      return { userId, sessionId };
    } catch {
      // Expired, tampered, wrong issuer, malformed — all the same to a caller.
      // Distinguishing them in the response would help an attacker probe.
      return null;
    }
  }

  /**
   * 32 bytes from the CSPRNG, base64url encoded. Only the SHA-256 is stored, so
   * a database leak yields no usable session.
   *
   * SHA-256 rather than Argon2 here is intentional: the token already has 256
   * bits of entropy, so there is no dictionary to defend against, and refresh
   * happens often enough that a deliberately slow hash would be felt.
   */
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
