import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/modules/auth/auth.service';
import type { PasswordBreachChecker } from '../src/ports/auth';

const context = { ipAddress: null, userAgent: null };
const passphrase = 'correct horse battery staple';

function service(passwordBreachChecker: PasswordBreachChecker): AuthService {
  // These cases deliberately fail before any persistence, token, or hashing
  // call. Lightweight placeholders make the enforced ordering explicit: a
  // known-breached candidate must never consume a reset token or Argon2 work.
  return new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    passwordBreachChecker,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('compromised-password enforcement', () => {
  it('rejects a breached registration before hashing or account creation', async () => {
    const checker: PasswordBreachChecker = {
      required: true,
      check: vi.fn(async () => ({ kind: 'compromised' as const, occurrences: 7 })),
    };

    await expect(
      service(checker).register(
        'new-user@example.com',
        passphrase,
        null,
        { acceptedTerms: false, termsVersion: null, acceptedPrivacyNotice: false, privacyVersion: null },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(checker.check).toHaveBeenCalledWith(passphrase);
  });

  it('rejects a reset before consuming its one-time token when the candidate is breached', async () => {
    const checker: PasswordBreachChecker = {
      required: true,
      check: vi.fn(async () => ({ kind: 'compromised' as const, occurrences: 1 })),
    };

    await expect(
      service(checker).confirmPasswordReset('reset-token', passphrase, context),
    ).rejects.toMatchObject({ status: 400 });
    expect(checker.check).toHaveBeenCalledWith(passphrase);
  });

  it('fails closed only when production screening is required but unavailable', async () => {
    const checker: PasswordBreachChecker = {
      required: true,
      check: vi.fn(async () => ({ kind: 'unavailable' as const })),
    };

    await expect(
      service(checker).register(
        'new-user@example.com',
        passphrase,
        null,
        { acceptedTerms: false, termsVersion: null, acceptedPrivacyNotice: false, privacyVersion: null },
        context,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
