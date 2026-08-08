import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAccountDeletionStore } from '../src/infra/auth/account-deletion-stores';
import { closePool } from '../src/infra/postgres/pool';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

const ownerUrl = OWNER_URL;

if (ownerUrl) {
  describe('account deletion: PostgreSQL erasure proof', () => {
    let harness: PgHarness;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
    });

    afterAll(async () => {
      await harness?.close();
      await closePool();
    });

    it('removes identity, audit, session, and every financial row as the owner can verify', async () => {
      const userId = randomUUID();
      const email = `erase-${userId}@example.com`;

      await harness.owner.query(
        `INSERT INTO users (id, email, password_hash, status)
         VALUES ($1, $2, 'test-hash', 'active')`,
        [userId, email],
      );
      await harness.owner.query(
        `INSERT INTO accounts
           (id, user_id, name, type, mask, currency, balance_current)
         VALUES ('account-1', $1, 'Checking', 'checking', '1234', 'CAD', 10000)`,
        [userId],
      );
      await harness.owner.query(
        `INSERT INTO transactions
           (id, user_id, account_id, provider_txn_id, posted_at, amount, currency,
            raw_descriptor, normalized_descriptor, category_slug, category_source,
            category_confidence)
         VALUES
           ('txn-1', $1, 'account-1', 'provider-1', '2026-08-01', -500, 'CAD',
            'Coffee', 'coffee', 'coffee', 'provider', 1)`,
        [userId],
      );
      await harness.owner.query(
        `INSERT INTO budgets (id, user_id, category_slug, limit_amount, currency, period)
         VALUES ('budget-1', $1, 'coffee', 5000, 'CAD', 'monthly')`,
        [userId],
      );
      await harness.owner.query(
        `INSERT INTO categorization_rules
           (id, user_id, match_type, pattern, category_slug)
         VALUES ('rule-1', $1, 'contains', 'coffee', 'coffee')`,
        [userId],
      );
      await harness.owner.query(
        `INSERT INTO sessions
           (id, user_id, family_id, token_hash, expires_at)
         VALUES ('session-1', $1, 'family-1', $2, now() + interval '30 days')`,
        [userId, `hash-${userId}`],
      );
      await harness.owner.query(
        `INSERT INTO auth_events
           (id, user_id, email_attempted, kind, succeeded)
         VALUES ('event-' || $1, $1, $2, 'login', true)`,
        [userId, email],
      );

      const deletions = new PostgresAccountDeletionStore(harness.app);
      const requestedAt = new Date('2026-08-01T00:00:00.000Z');
      const purgeAfter = new Date('2026-08-31T00:00:00.000Z');
      await deletions.request(userId, email, requestedAt, purgeAfter);

      expect(await deletions.purgeDue(new Date('2026-08-30T23:59:59.000Z'))).toBe(0);
      expect(await deletions.purgeDue(purgeAfter)).toBe(1);

      // These checks deliberately use the schema owner. An RLS-scoped query
      // can return zero while rows still exist, which is not erasure proof.
      for (const table of [
        'users',
        'accounts',
        'transactions',
        'budgets',
        'categorization_rules',
        'sessions',
      ]) {
        const column = table === 'users' ? 'id' : 'user_id';
        const result = await harness.owner.query(
          `SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`,
          [userId],
        );
        expect(result.rows[0].count, table).toBe(0);
      }

      const audit = await harness.owner.query(
        `SELECT count(*)::int AS count FROM auth_events
         WHERE user_id = $1 OR lower(email_attempted) = lower($2)`,
        [userId, email],
      );
      expect(audit.rows[0].count).toBe(0);
    });
  });
} else {
  describe('account deletion: PostgreSQL erasure proof', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
