import { Pool, types } from 'pg';

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

let pool: Pool | null = null;

export function getPool(connectionString?: string): Pool {
  if (pool) return pool;

  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres with `npm run infra:up`, or run ' +
        'with STORE=memory to use the in-memory adapter.',
    );
  }

  pool = new Pool({
    connectionString: url,
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

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(
  pg: Pool,
  fn: (client: import('pg').PoolClient) => Promise<T>,
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
