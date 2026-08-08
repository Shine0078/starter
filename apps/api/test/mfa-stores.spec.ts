import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MfaStore } from '../src/ports/auth';
import { InMemoryMfaStore, PostgresMfaStore } from '../src/infra/auth/mfa-stores';
import { closePool } from '../src/infra/postgres/pool';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

async function provesMfaStore(store: MfaStore, userId: string): Promise<void> {
  const now = new Date('2026-08-08T12:00:00.000Z');
  await store.savePending(userId, 'encrypted-secret', now);
  expect((await store.get(userId))?.enabledAt).toBeNull();
  expect(await store.enable(userId, ['recovery-1', 'recovery-2'], now)).toBe(true);
  expect(await store.enable(userId, ['replacement'], now)).toBe(false);
  expect(await store.acceptTotpStep(userId, 100)).toBe(true);
  expect(await store.acceptTotpStep(userId, 100)).toBe(false);
  expect(await store.consumeRecoveryCode(userId, 'recovery-1', now)).toBe(true);
  expect(await store.consumeRecoveryCode(userId, 'recovery-1', now)).toBe(false);
  expect(await store.recoveryCodesRemaining(userId)).toBe(1);

  const expiry = new Date(now.getTime() + 300_000);
  await store.createChallenge('challenge', userId, expiry, now);
  expect((await store.findChallenge('challenge', now))?.userId).toBe(userId);
  expect(await store.failChallenge('challenge', now)).toBe(4);
  expect(await store.consumeChallenge('challenge', now)).toBe(true);
  expect(await store.consumeChallenge('challenge', now)).toBe(false);
  expect(await store.findChallenge('challenge', now)).toBeNull();

  await store.createChallenge('limited', userId, expiry, now);
  for (const remaining of [4, 3, 2, 1, 0]) {
    expect(await store.failChallenge('limited', now)).toBe(remaining);
  }
  expect(await store.findChallenge('limited', now)).toBeNull();
}

describe('MFA store: in-memory', () => {
  it('enforces one-time factors and challenges', async () => {
    await provesMfaStore(new InMemoryMfaStore(), randomUUID());
  });
});

const ownerUrl = OWNER_URL;

if (ownerUrl) {
  describe('MFA store: PostgreSQL', () => {
    let harness: PgHarness;
    let userId: string;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
      userId = randomUUID();
      await harness.owner.query(
        "INSERT INTO users (id,email,password_hash,status) VALUES ($1,$2,'hash','active')",
        [userId, `mfa-${userId}@example.com`],
      );
    });

    afterAll(async () => {
      if (harness && userId) await harness.owner.query('DELETE FROM users WHERE id=$1', [userId]);
      await harness?.close();
      await closePool();
    });

    it('enforces one-time factors and challenges through the runtime role', async () => {
      await provesMfaStore(new PostgresMfaStore(harness.app), userId);
    });
  });
} else {
  describe('MFA store: PostgreSQL', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
