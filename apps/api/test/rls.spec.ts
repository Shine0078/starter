/**
 * Row-level security, tested at the level it operates on.
 *
 * The store contract already proves that the stores refuse cross-user reads,
 * and test/auth-api.spec.ts proves the API does. Both would keep passing if
 * every policy were dropped tomorrow, because both go through code that filters
 * correctly. What is verified here is the layer underneath: that a query which
 * *forgets* its user filter still comes back with nothing.
 *
 * So these tests deliberately issue the unfiltered statements no store would
 * write — `SELECT * FROM transactions` with no WHERE clause — and assert that
 * the database withholds the rows on its own.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

import { isRlsEnforcedFor, parseAppRole } from '../src/infra/postgres/app-role';
import { closePool, withUserScope } from '../src/infra/postgres/pool';
import { OWNER_URL, startPgHarness, type PgHarness } from './pg-harness';

const ALICE = 'user_rls_alice';
const BOB = 'user_rls_bob';

/** Every user-owned table protected by row-level security. */
const PROTECTED_TABLES = [
  'accounts',
  'transactions',
  'budgets',
  'categorization_rules',
  'goals',
  'goal_contributions',
  'notification_preferences',
  'notifications',
  'institution_links',
  'bank_webhook_jobs',
  'consent_events',
];

/** Seeds one account and one transaction for a user, as the owner. */
async function seed(owner: Pool, userId: string, amount: number): Promise<void> {
  await owner.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
  await owner.query(
    `INSERT INTO accounts (id, user_id, name, type, mask, currency, balance_current)
     VALUES ($1, $2, 'Checking', 'checking', '0000', 'USD', 100000)`,
    [`acc_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO transactions (
       id, user_id, account_id, provider_txn_id, posted_at, amount, currency,
       raw_descriptor, normalized_descriptor, category_slug, category_source,
       category_confidence
     ) VALUES ($1, $2, $3, $4, '2026-08-01', $5, 'USD', 'RENT', 'rent', 'housing', 'rule', 1)`,
    [`txn_${userId}`, userId, `acc_${userId}`, `prov_${userId}`, amount],
  );
  await owner.query(
    `INSERT INTO budgets (id, user_id, category_slug, limit_amount, currency, period)
     VALUES ($1, $2, 'groceries', 50000, 'USD', 'monthly')`,
    [`bud_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO categorization_rules (id, user_id, match_type, pattern, category_slug)
     VALUES ($1, $2, 'contains', 'rent', 'housing')`,
    [`rule_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO goals (id, user_id, name, target_amount, currency, created_at)
     VALUES ($1, $2, 'Emergency fund', 500000, 'USD', '2026-08-01')`,
    [`goal_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO goal_contributions (id, user_id, goal_id, amount, contributed_at)
     VALUES ($1, $2, $3, 10000, '2026-08-02')`,
    [`contribution_${userId}`, userId, `goal_${userId}`],
  );
  await owner.query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [userId]);
  await owner.query(
    `INSERT INTO notifications
       (id, user_id, kind, title, message, severity, dedupe_key, created_at)
     VALUES ($1, $2, 'budget', 'Budget', 'Budget warning', 'warning', $3, now())`,
    [`notification_${userId}`, userId, `budget:${userId}`],
  );
  await owner.query(
    `INSERT INTO institution_links
       (id,user_id,provider,provider_item_id,institution_name,encrypted_access_token,status,created_at)
     VALUES ($1,$2,'plaid',$3,'Sandbox Bank','encrypted','healthy',now())`,
    [`link_${userId}`, userId, `item_${userId}`],
  );
  await owner.query(
    `INSERT INTO bank_webhook_jobs
       (id,user_id,link_id,body_hash,status,attempts,available_at,created_at)
     VALUES ($1,$2,$3,$4,'pending',0,now(),now())`,
    [`webhook_${userId}`, userId, `link_${userId}`, `hash_${userId}`],
  );
  await owner.query(
    `INSERT INTO consent_events
       (id,user_id,kind,granted,policy_version,source,created_at)
     VALUES ($1,$2,'analytics',false,'preference-v1','user_settings',now())`,
    [`consent_${userId}`, userId],
  );
}

if (!OWNER_URL) {
  describe('row-level security', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
} else {
  const ownerUrl = OWNER_URL;

  describe('row-level security', () => {
    let harness: PgHarness;
    let owner: Pool;
    let app: Pool;

    beforeAll(async () => {
      harness = await startPgHarness(ownerUrl);
      owner = harness.owner;
      app = harness.app;
    });

    afterAll(async () => {
      await harness.close();
      await closePool();
    });

    beforeEach(async () => {
      await owner.query('DELETE FROM users WHERE id = ANY($1)', [[ALICE, BOB]]);
      await seed(owner, ALICE, -180_000);
      await seed(owner, BOB, -220_000);
    });

    // ------------------------------------------------- the preconditions

    // These three are why the file exists. Each of them fails open: get one
    // wrong and every assertion below still passes, against nothing.

    it('the runtime role is not a superuser and does not hold BYPASSRLS', async () => {
      const { role } = parseAppRole(harness.appUrl);
      expect(await isRlsEnforcedFor(owner, role)).toBe(true);
    });

    it('connects as the runtime role, not the owner', async () => {
      const { rows } = await app.query<{ user: string }>('SELECT current_user AS user');
      expect(rows[0]?.user).toBe(parseAppRole(harness.appUrl).role);
    });

    it.each(PROTECTED_TABLES)('%s has row security enabled and forced', async (table) => {
      const { rows } = await owner.query<{ enabled: boolean; forced: boolean }>(
        `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
         FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
        [table],
      );
      // FORCE matters as much as ENABLE: without it the owner is exempt, and
      // anything connecting as the owner sees every row.
      expect(rows[0]).toEqual({ enabled: true, forced: true });
    });

    // ------------------------------------------------------------ reads

    it.each(PROTECTED_TABLES)(
      'an unfiltered SELECT on %s returns only the scoped user\'s rows',
      async (table) => {
        const rows = await withUserScope(app, ALICE, async (client) => {
          const result = await client.query<{ user_id: string }>(`SELECT user_id FROM ${table}`);
          return result.rows;
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.user_id).toBe(ALICE);
      },
    );

    it('a query naming another user explicitly still returns nothing', async () => {
      const rows = await withUserScope(app, ALICE, async (client) => {
        const result = await client.query('SELECT * FROM transactions WHERE user_id = $1', [BOB]);
        return result.rows;
      });

      expect(rows).toHaveLength(0);
    });

    it('sees nothing at all outside a scope', async () => {
      // No transaction, no `finverse.user_id` — the state a connection is in
      // the moment it leaves the pool. The predicate evaluates to NULL, which
      // is not true, so no row qualifies.
      const { rows } = await app.query('SELECT * FROM transactions');
      expect(rows).toHaveLength(0);
    });

    it('routes a provider Item through the narrow owner function without exposing the token', async () => {
      const result = await app.query(
        'SELECT * FROM finverse_link_owner($1)',
        [`item_${ALICE}`],
      );
      expect(result.fields.map((field) => field.name)).toEqual(['user_id', 'link_id']);
      expect(result.rows).toEqual([{ user_id: ALICE, link_id: `link_${ALICE}` }]);
    });

    it('atomically claims webhook jobs while returning only opaque routing fields', async () => {
      const result = await app.query('SELECT * FROM finverse_claim_bank_webhooks(10)');
      expect(result.fields.map((field) => field.name)).toEqual([
        'id', 'user_id', 'link_id', 'body_hash', 'attempts', 'available_at',
      ]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((row) => row.attempts === 1)).toBe(true);
      const second = await app.query('SELECT * FROM finverse_claim_bank_webhooks(10)');
      expect(second.rows).toHaveLength(0);
    });

    it('sees nothing when the scope is set to a blank user', async () => {
      // `nullif` in finverse_current_user_id() exists for exactly this: without
      // it, '' would match any row whose user_id happened to be blank.
      const client = await app.connect();
      try {
        await client.query("SET finverse.user_id = ''");
        const { rows } = await client.query('SELECT * FROM accounts');
        expect(rows).toHaveLength(0);
      } finally {
        // Destroy rather than release: this deliberately set the GUC at session
        // scope, and returning the connection to the pool would carry it into
        // whatever runs next.
        client.release(true);
      }
    });

    // ----------------------------------------------------------- writes

    it('refuses an INSERT that claims another user', async () => {
      await expect(
        withUserScope(app, ALICE, (client) =>
          client.query(
            `INSERT INTO budgets (id, user_id, category_slug, limit_amount, currency, period)
             VALUES ('bud_smuggled', $1, 'travel', 10000, 'USD', 'monthly')`,
            [BOB],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);

      const { rows } = await owner.query('SELECT id FROM budgets WHERE id = $1', ['bud_smuggled']);
      expect(rows).toHaveLength(0);
    });

    it('refuses to move a row to another user', async () => {
      await expect(
        withUserScope(app, ALICE, (client) =>
          client.query('UPDATE transactions SET user_id = $1 WHERE user_id = $2', [BOB, ALICE]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('an unfiltered UPDATE touches only the scoped user', async () => {
      await withUserScope(app, ALICE, (client) =>
        client.query('UPDATE transactions SET amount = -1'),
      );

      const { rows } = await owner.query<{ user_id: string; amount: number }>(
        'SELECT user_id, amount FROM transactions ORDER BY user_id',
      );
      expect(rows).toEqual([
        { user_id: ALICE, amount: -1 },
        { user_id: BOB, amount: -220_000 },
      ]);
    });

    it('an unfiltered DELETE removes only the scoped user\'s rows', async () => {
      const deleted = await withUserScope(app, ALICE, async (client) => {
        const result = await client.query('DELETE FROM budgets');
        return result.rowCount;
      });

      expect(deleted).toBe(1);

      const { rows } = await owner.query<{ user_id: string }>('SELECT user_id FROM budgets');
      expect(rows.map((r) => r.user_id)).toEqual([BOB]);
    });

    // ------------------------------------------------------- the scope itself

    it('does not leak the scope to the next user of the connection', async () => {
      // `set_config(..., true)` is transaction-local. If it were session-local,
      // a pooled connection would carry one user's scope into the next
      // request — the worst possible version of this bug, since it would leak
      // sporadically and only under load.
      await withUserScope(app, ALICE, async (client) => {
        const { rows } = await client.query('SELECT * FROM accounts');
        expect(rows).toHaveLength(1);
      });

      const { rows } = await app.query('SELECT * FROM accounts');
      expect(rows).toHaveLength(0);
    });

    it('rejects an empty user id rather than scoping to nobody', async () => {
      await expect(withUserScope(app, '', async () => 'unreachable')).rejects.toThrow(
        /non-empty user id/i,
      );
    });

    // -------------------------------------------------------------- grants

    it('cannot rewrite migration history', async () => {
      await expect(
        app.query("INSERT INTO schema_migrations (name) VALUES ('999_forged.sql')"),
      ).rejects.toThrow(/permission denied/i);
    });

    it('cannot create objects in the public schema', async () => {
      // A role able to create here could shadow finverse_current_user_id() and
      // rewrite the predicate every policy depends on.
      await expect(app.query('CREATE TABLE rls_probe (id int)')).rejects.toThrow(
        /permission denied/i,
      );
    });
  });
}
