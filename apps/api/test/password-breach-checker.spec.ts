import { describe, expect, it, vi } from 'vitest';

import {
  DisabledPasswordBreachChecker,
  HaveIBeenPwnedPasswordBreachChecker,
  parseRange,
} from '../src/infra/auth/password-breach-checker';

const PASSWORD_SHA1_PREFIX = '5BAA6';
const PASSWORD_SHA1_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

describe('HIBP password breach checker', () => {
  it('sends only a five-character SHA-1 prefix and finds a compromised password', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(`${PASSWORD_SHA1_SUFFIX}:3861493\r\n${'A'.repeat(35)}:1\r\n`),
    );
    const checker = new HaveIBeenPwnedPasswordBreachChecker({ required: true, fetch });

    await expect(checker.check('password')).resolves.toEqual({
      kind: 'compromised',
      occurrences: 3861493,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PASSWORD_SHA1_PREFIX}`);
    expect(new URL(String(url)).pathname).toBe(`/range/${PASSWORD_SHA1_PREFIX}`);
    expect(init?.headers).toMatchObject({
      Accept: 'text/plain',
      'Add-Padding': 'true',
    });
  });

  it('deduplicates concurrent requests and caches a range without retaining passwords', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(`${'A'.repeat(35)}:1\r\n`),
    );
    const checker = new HaveIBeenPwnedPasswordBreachChecker({ required: false, fetch });

    await Promise.all([
      checker.check('password'),
      checker.check('password'),
      checker.check('password'),
    ]);
    await checker.check('password');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable instead of leaking provider failures', async () => {
    const checker = new HaveIBeenPwnedPasswordBreachChecker({
      required: true,
      fetch: async () => new Response('maintenance', { status: 503 }),
    });

    await expect(checker.check('a long enough candidate')).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('bounds malformed range parsing and retains only valid suffix-count rows', () => {
    const rows = parseRange([
      `${'B'.repeat(35)}:5`,
      'not-a-hash:2',
      `${'C'.repeat(35)}:not-a-number`,
      `${'D'.repeat(35)}:3:unexpected`,
    ].join('\n'));

    expect(rows).toEqual(new Map([['B'.repeat(35), 5]]));
  });

  it('keeps local development offline when screening is explicitly disabled', async () => {
    await expect(new DisabledPasswordBreachChecker().check('anything')).resolves.toEqual({
      kind: 'safe',
    });
  });
});
