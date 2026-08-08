import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresThrottlerStorage } from '../src/infra/http/postgres-throttler-storage';
import { closePool } from '../src/infra/postgres/pool';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

const ownerUrl = OWNER_URL;

if (ownerUrl) {
  describe('PostgreSQL throttler storage', () => {
    let harness: PgHarness;
    const keys: string[] = [];

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
    });

    afterAll(async () => {
      if (harness && keys.length > 0) {
        await harness.owner.query('DELETE FROM rate_limit_buckets WHERE key_hash = ANY($1)', [
          keys,
        ]);
      }
      await harness?.close();
      await closePool();
    });

    it('shares atomic limits across adapter instances and survives a blocked request', async () => {
      const key = randomUUID();
      keys.push(key);
      const firstInstance = new PostgresThrottlerStorage(harness.app);
      const secondInstance = new PostgresThrottlerStorage(harness.app);

      await expect(firstInstance.increment(key, 60_000, 2, 30_000, 'default')).resolves.toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
      await expect(secondInstance.increment(key, 60_000, 2, 30_000, 'default')).resolves.toMatchObject({
        totalHits: 2,
        isBlocked: false,
      });
      await expect(firstInstance.increment(key, 60_000, 2, 30_000, 'default')).resolves.toMatchObject({
        totalHits: 3,
        isBlocked: true,
      });
      await expect(secondInstance.increment(key, 60_000, 2, 30_000, 'default')).resolves.toMatchObject({
        totalHits: 3,
        isBlocked: true,
      });

      const persisted = await harness.owner.query<{ total_hits: number }>(
        'SELECT total_hits FROM rate_limit_buckets WHERE key_hash = $1 AND throttler_name = $2',
        [key, 'default'],
      );
      expect(persisted.rows[0]?.total_hits).toBe(3);
    });

    it('resets after a block expires and isolates named throttlers', async () => {
      const key = randomUUID();
      keys.push(key);
      const storage = new PostgresThrottlerStorage(harness.app);
      await storage.increment(key, 60_000, 1, 30_000, 'default');
      expect((await storage.increment(key, 60_000, 1, 30_000, 'default')).isBlocked).toBe(true);

      await harness.owner.query(
        `UPDATE rate_limit_buckets
            SET blocked_until = clock_timestamp() - interval '1 second'
          WHERE key_hash = $1 AND throttler_name = 'default'`,
        [key],
      );

      await expect(storage.increment(key, 60_000, 1, 30_000, 'default')).resolves.toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
      await expect(storage.increment(key, 60_000, 1, 30_000, 'login')).resolves.toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
    });
  });
} else {
  describe('PostgreSQL throttler storage', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
