import { Pool, types, type PoolClient } from 'pg';

/**
 * Two type parsers have to be registered before any query runs. Both fix
 * silent data corruption rather than crashes, which is why they live here at
 * module scope with an explanation rather than somewhere convenient.
 */

// ---- DATE (oid 1082)
//
// node-postgres parses a `date` column into a JS Date at local midnight. For
// anyone west of UTC, `2026-08-01` becomes `2026-07-31T23:00:00`, and
// `toISOString().slice(0,10)` then yields the previous day. Every transaction
// on the 1st of a month silently moves into the previous month, and every
// monthly total is wrong.
//
// The domain treats dates as `YYYY-MM-DD` strings throughout, so hand the
// string back untouched.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// ---- INT8 / bigint (oid 20)
//
// Returned as a string by default, because a Postgres bigint can exceed
// JavaScript's safe integer range. Money in minor units cannot:
// Number.MAX_SAFE_INTEGER is ~9.007e15 minor units, roughly $90 trillion,
// which is far beyond any personal balance sheet (ADR-0003).
//
// Without this, `amount` arrives as "-450" and `a + b` concatenates strings.
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

/**
 * Two pools, because the process connects with two different identities.
 *
 * The *admin* pool owns the schema: it runs migrations and provisions the
 * application role. The *app* pool is what serves requests, and it connects as
 * a role with no superuser bit — which is the entire reason row-level security
 * does anything, since a superuser bypasses every policy silently (ADR-0004).
 *
 * When DATABASE_APP_URL is unset the app pool falls back to the admin URL. That
 * keeps a single-URL setup working; core.module warns that RLS is inert in that
 * configuration rather than letting it look enforced.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // An error on an idle client is emitted on the pool, not on a query. Without
  // a listener, Node treats it as an unhandled 'error' event and exits.
  pool.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('[postgres] idle client error', error);
  });

  return pool;
}

let adminPool: Pool | null = null;
let appPool: Pool | null = null;

function requireUrl(connectionString: string | undefined, variable: string): string {
  const url = connectionString ?? process.env[variable];
  if (!url) {
    throw new Error(
      `${variable} is not set. Start Postgres with \`npm run infra:up\`, or run ` +
        'with STORE=memory to use the in-memory adapter.',
    );
  }
  return url;
}

/** The schema owner. Migrations and role provisioning only. */
export function getPool(connectionString?: string): Pool {
  if (adminPool) return adminPool;
  adminPool = createPool(requireUrl(connectionString, 'DATABASE_URL'));
  return adminPool;
}

/** The least-privileged runtime connection. Everything that serves a request. */
export function getAppPool(connectionString?: string): Pool {
  if (appPool) return appPool;
  const url = connectionString ?? process.env.DATABASE_APP_URL;
  if (!url) return getPool();
  appPool = createPool(url);
  return appPool;
}

export async function closePool(): Promise<void> {
  const open = [appPool, adminPool].filter((p): p is Pool => p !== null);
  appPool = null;
  adminPool = null;
  await Promise.all(open.map((p) => p.end()));
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(
  pg: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pg.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The session variable the RLS policies in 003_rls.sql read. Changing it here
 * without changing the migration turns every policy into "match nothing".
 */
export const USER_SCOPE_SETTING = 'finverse.user_id';

/**
 * Runs `fn` with the current user pinned for the database's benefit.
 *
 * Every policy compares `user_id` against this setting, so a query that forgets
 * its `WHERE user_id = $1` returns nothing rather than everything. The setting
 * is transaction-local (`set_config(..., true)`), which is why the scope has to
 * be a transaction: a pooled connection is handed to the next request the
 * moment this one finishes, and a session-level setting would follow it there.
 *
 * This is defence in depth, not the primary control. The store methods still
 * filter explicitly — a policy and a predicate have to both be wrong before
 * one user sees another's money.
 */
export async function withUserScope<T>(
  pg: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  // An empty id would set the GUC to '' — which the policies treat as "no user"
  // and every read would come back empty, looking like missing data rather than
  // a bug. Fail where the mistake is.
  if (!userId) throw new Error('withUserScope requires a non-empty user id');

  return withTransaction(pg, async (client) => {
    await client.query('SELECT set_config($1, $2, true)', [USER_SCOPE_SETTING, userId]);
    return fn(client);
  });
}
