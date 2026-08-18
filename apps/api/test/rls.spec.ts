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

import { assertRestrictedRuntimeRole, isRlsEnforcedFor, parseAppRole } from '../src/infra/postgres/app-role';
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
  'subscriptions',
  'receipts',
  'push_tokens',
  'webauthn_credentials',
  'net_worth_snapshots',
  'account_reconciliations',
  'saved_views',
  'import_batches',
  'scheduled_transactions',
  'rule_applications',
  'rule_application_changes',
  'fx_rates',
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
    `INSERT INTO subscriptions
       (user_id, plan, status, provider_customer_id, provider_subscription_id)
     VALUES ($1, 'pro', 'active', $2, $3)`,
    [userId, `cus_${userId}`, `sub_${userId}`],
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
  await owner.query(
    `INSERT INTO receipts
       (id,user_id,merchant,text,created_at)
     VALUES ($1,$2,'Blue Bottle','receipt text',now())`,
    [`receipt_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO push_tokens (user_id, token, platform, created_at, last_seen_at)
     VALUES ($1, $2, 'android', now(), now())`,
    [userId, `push_${userId}`.padEnd(20, 'x')],
  );
  await owner.query(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key_pem, created_at)
     VALUES ($1, $2, '-----BEGIN PUBLIC KEY-----', now())`,
    [userId, `wa_${userId}`],
  );
  await owner.query(
    `INSERT INTO net_worth_snapshots
       (user_id, recorded_on, currency, assets, debts, net_position)
     VALUES ($1, '2026-08-08', 'USD', 100000, 0, 100000)`,
    [userId],
  );
  await owner.query(
    `INSERT INTO account_reconciliations
       (id, user_id, account_id, statement_date, observed_balance, currency,
        computed_balance, difference, source)
     VALUES ($1, $2, $3, '2026-08-01', 100000, 'USD', 100000, 0, 'manual_count')`,
    [`rec_${userId}`, userId, `acc_${userId}`],
  );
  await owner.query(
    `INSERT INTO saved_views (id, user_id, name) VALUES ($1, $2, 'Default')`,
    [`view_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO import_batches
       (id, user_id, account_id, filename, status, rows_total, rows_imported, rows_duplicate, rows_invalid)
     VALUES ($1, $2, $3, 'export.csv', 'committed', 1, 1, 0, 0)`,
    [`imp_${userId}`, userId, `acc_${userId}`],
  );
  await owner.query(
    `INSERT INTO scheduled_transactions
       (id, user_id, account_id, name, amount, currency, category_slug, cadence, start_date)
     VALUES ($1, $2, $3, 'Rent', -180000, 'USD', 'housing', 'monthly', '2026-08-01')`,
    [`sch_${userId}`, userId, `acc_${userId}`],
  );
  await owner.query(
    `INSERT INTO rule_applications
       (id, user_id, pattern, match_type, category_slug, rows_changed)
     VALUES ($1, $2, 'rent', 'contains', 'housing', 1)`,
    [`rapp_${userId}`, userId],
  );
  await owner.query(
    `INSERT INTO rule_application_changes
       (application_id, user_id, transaction_id, previous_category_slug, previous_category_source, previous_confidence)
     VALUES ($1, $2, $3, 'uncategorized', 'rule', 1)`,
    [`rapp_${userId}`, userId, `txn_${userId}`],
  );
  await owner.query(
    `INSERT INTO fx_rates (id, user_id, base, quote, rate, as_of, source)
     VALUES ($1, $2, 'USD', 'CAD', 1.35, '2026-08-01', 'manual')`,
    [`fx_${userId}`, userId],
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
      await expect(assertRestrictedRuntimeRole(app)).resolves.toBe(role);
      await expect(assertRestrictedRuntimeRole(owner)).rejects.toThrow(/SUPERUSER or BYPASSRLS/i);
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

    it('blocks unscoped WebAuthn credential lookup and requires a routing function', async () => {
      const credentialId = `wa_${ALICE}`;
      const raw = await app.query(
        'SELECT user_id FROM webauthn_credentials WHERE credential_id = $1',
        [credentialId],
      );
      expect(raw.rows).toHaveLength(0);

      const routed = await app.query<{ user_id: string }>(
        'SELECT * FROM finverse_webauthn_credential_owner($1)',
        [credentialId],
      );

      expect(routed.fields.map((field) => field.name)).toEqual(['user_id']);
      expect(routed.rows).toEqual([{ user_id: ALICE }]);
    });
    it('grants the runtime role execute on the narrow routing functions only', async () => {
      const { role } = parseAppRole(harness.appUrl);
      const { rows } = await owner.query<{
        fn: string;
        can_execute: boolean;
      }>(`
        SELECT proname AS fn,
               has_function_privilege($1, oid, 'EXECUTE') AS can_execute
          FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN (
             'finverse_link_owner',
             'finverse_claim_bank_webhooks',
             'finverse_is_split_member',
             'finverse_subscription_owner',
             'finverse_webauthn_credential_owner'
           )
         ORDER BY proname
      `, [role]);
      expect(rows.map((row) => row.fn)).toEqual([
        'finverse_claim_bank_webhooks',
        'finverse_is_split_member',
        'finverse_link_owner',
        'finverse_subscription_owner',
        'finverse_webauthn_credential_owner',
      ]);
      expect(rows.every((row) => row.can_execute)).toBe(true);
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
