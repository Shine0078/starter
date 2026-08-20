import { describe, expect, it } from 'vitest';

import { redactCrashText } from '../src/infra/observability/crash-reporter';

describe('crash reporter redaction', () => {
  it('removes tokens, emails, and long numbers from crash text', () => {
    const raw =
      'Bearer abcdefghijklmnop failed for sam@example.com account 1234567890';
    expect(redactCrashText(raw)).toBe(
      '[redacted] failed for [redacted] account [redacted]',
    );
  });
});
