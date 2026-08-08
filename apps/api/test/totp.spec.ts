import { describe, expect, it } from 'vitest';

import { generateTotpSecret, otpauthUri, totpAt, verifyTotp } from '../src/domain/auth/totp';

describe('TOTP', () => {
  it('generates authenticator-compatible secrets and verifies only the allowed time window', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-08-08T12:00:00.000Z');
    const { code, step } = totpAt(secret, now);

    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, now)).toBe(step);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 61_000))).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('builds an issuer-labelled URI without exposing data outside the URI', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'person+money@example.com');
    expect(uri).toContain('FINVERSE%3Aperson%2Bmoney%40example.com');
    expect(uri).toContain('issuer=FINVERSE');
    expect(uri).toContain('algorithm=SHA1&digits=6&period=30');
  });
});
