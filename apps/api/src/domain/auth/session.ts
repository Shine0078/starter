/**
 * Refresh-token rotation, as a pure decision.
 *
 * Follows OAuth 2.0 Security BCP: refresh tokens are single-use, and presenting
 * one that has already been rotated means it was captured. The response is to
 * revoke the entire family, logging out both the attacker and the legitimate
 * user. That is the correct trade — a forced re-login is a nuisance, a live
 * session in someone else's hands is a breach.
 */

import type { Session } from './types';

export type RefreshOutcome =
  | { kind: 'ok'; session: Session }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  /** Already-rotated token replayed. Revoke `familyId` in full. */
  | { kind: 'reuse_detected'; familyId: string; userId: string };

export function evaluateRefresh(session: Session | null, now: Date): RefreshOutcome {
  if (!session) return { kind: 'not_found' };

  if (session.revokedAt !== null) {
    // A token revoked by rotation coming back is the attack signature. A token
    // revoked by an explicit logout is just stale — the user already ended it,
    // so tearing down the family adds nothing.
    if (session.revokedReason === 'rotated') {
      return { kind: 'reuse_detected', familyId: session.familyId, userId: session.userId };
    }
    return { kind: 'revoked' };
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    return { kind: 'expired' };
  }

  return { kind: 'ok', session };
}

export function isSessionActive(session: Session, now: Date): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
