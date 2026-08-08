/**
 * Password rules.
 *
 * Deliberately follows NIST SP 800-63B rather than the familiar
 * "one uppercase, one digit, one symbol" pattern. Composition rules push people
 * toward `Password1!` and toward reusing the same mangled password everywhere;
 * length plus a blocklist of known-common choices measurably beats them. If
 * someone reviews this expecting composition requirements, that is why they are
 * absent — it is a decision, not an omission.
 *
 * Pure functions: no hashing, no I/O. The hashing itself is infrastructure
 * (`infra/auth/argon2-hasher.ts`) because it is native, async, and slow by design.
 */

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Argon2 cost is a function of input size, so an unbounded password is a cheap
 * way to burn server CPU. 128 is far beyond any real passphrase.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * A deliberately small blocklist of passwords that survive a 12-character
 * minimum. A production deployment should check against a real corpus
 * (for example the Have I Been Pwned k-anonymity range API, which never
 * receives the password itself) — see docs/03-security-privacy.md.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password1234',
  'passw0rd1234',
  'qwertyuiop12',
  'administrator',
  'letmein12345',
  '123456789012',
  'iloveyou1234',
  'welcome12345',
  'monkey123456',
  'football1234',
  'trustno1trustno1',
  'passwordpassword',
  'qwertyqwerty',
  'abc123abc123',
  '111111111111',
  'aaaaaaaaaaaa',
]);

export interface PasswordCheck {
  ok: boolean;
  /** Every failure, so the UI can show them at once instead of one per attempt. */
  problems: string[];
}

export function checkPassword(password: string, email?: string): PasswordCheck {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  }

  const normalized = password.toLowerCase();

  if (COMMON_PASSWORDS.has(normalized)) {
    problems.push('This password is too common. Choose something less predictable.');
  }

  // A single repeated character clears a length check without adding entropy.
  if (password.length > 0 && new Set(password).size <= 2) {
    problems.push('Use more than a couple of distinct characters.');
  }

  if (email) {
    const localPart = email.split('@')[0]?.toLowerCase() ?? '';
    if (localPart.length >= 4 && normalized.includes(localPart)) {
      problems.push('Do not include your email address in your password.');
    }
  }

  return { ok: problems.length === 0, problems };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Lowercased and trimmed. Everything downstream — storage, lookup, the unique
 * index, brute-force counting — assumes this has been applied, so that
 * `Sam@Example.com` and `sam@example.com` cannot become two accounts.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}
