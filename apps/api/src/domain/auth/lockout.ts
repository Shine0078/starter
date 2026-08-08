/**
 * Brute-force lockout, as a pure decision.
 *
 * Kept separate from the auth service so the thresholds can be tested exactly —
 * an off-by-one here either locks legitimate users out of their own money or
 * leaves an account guessable, and neither failure throws.
 */

export const MAX_FAILED_ATTEMPTS = 8;

/** How far back failures are counted. */
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

/** How long the account stays locked once the threshold is reached. */
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface LockoutState {
  locked: boolean;
  /** Failures inside the window. */
  recentFailures: number;
  /** Attempts left before locking, 0 when locked. */
  attemptsRemaining: number;
  /** When the lock lifts, null when not locked. */
  unlocksAt: Date | null;
  retryAfterSeconds: number;
}

/**
 * `failureTimestamps` is every failed attempt for this address, newest-first
 * order not required.
 *
 * Locking is by *account*, not by IP. IP-based lockout is trivially bypassed
 * with a proxy pool and punishes everyone behind a shared NAT. Per-IP request
 * throttling is a separate, coarser control applied at the HTTP layer.
 */
export function evaluateLockout(
  failureTimestamps: readonly Date[],
  now: Date,
  options: { maxAttempts?: number; windowMs?: number; lockoutMs?: number } = {},
): LockoutState {
  const maxAttempts = options.maxAttempts ?? MAX_FAILED_ATTEMPTS;
  const windowMs = options.windowMs ?? FAILURE_WINDOW_MS;
  const lockoutMs = options.lockoutMs ?? LOCKOUT_MS;

  const cutoff = now.getTime() - windowMs;
  const recent = failureTimestamps
    .filter((t) => t.getTime() >= cutoff)
    .sort((a, b) => b.getTime() - a.getTime());

  if (recent.length < maxAttempts) {
    return {
      locked: false,
      recentFailures: recent.length,
      attemptsRemaining: maxAttempts - recent.length,
      unlocksAt: null,
      retryAfterSeconds: 0,
    };
  }

  // The lock runs from the attempt that tripped it, not from the newest one.
  // Measuring from the newest would let an attacker who keeps trying hold the
  // real owner out indefinitely.
  const trippingAttempt = recent[maxAttempts - 1]!;
  const unlocksAt = new Date(trippingAttempt.getTime() + lockoutMs);

  if (unlocksAt.getTime() <= now.getTime()) {
    return {
      locked: false,
      recentFailures: recent.length,
      attemptsRemaining: 1,
      unlocksAt: null,
      retryAfterSeconds: 0,
    };
  }

  return {
    locked: true,
    recentFailures: recent.length,
    attemptsRemaining: 0,
    unlocksAt,
    retryAfterSeconds: Math.ceil((unlocksAt.getTime() - now.getTime()) / 1000),
  };
}
