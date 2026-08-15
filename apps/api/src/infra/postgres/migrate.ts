import '../../env';

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

import { parseAppRole, provisionAppRole } from './app-role';
import { getPool, withTransaction } from './pool';

/**
 * A deliberately small migration runner.
 *
 * Numbered `.sql` files, applied once, in order, each inside a transaction.
 * That is the whole feature set. Postgres has transactional DDL, so a failed
 * migration rolls back completely and leaves the database on the last good
 * version rather than half-migrated.
 *
 * No down-migrations: rolling a schema backwards in production is almost always
 * more dangerous than rolling forward with a corrective migration, and having
 * the button encourages reaching for it.
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');
const MIGRATION_LOCK_NAME = 'finverse:schema-migrations';

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  unknown: string[];
}

async function ensureMigrationsTable(pg: Pool): Promise<void> {
  await pg.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function inspectMigrations(pg: Pool = getPool()): Promise<MigrationStatus> {
  await ensureMigrationsTable(pg);

  const { rows } = await pg.query<{ name: string }>('SELECT name FROM schema_migrations');
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const known = new Set(files);
  const recorded = rows.map((row) => row.name).sort();

  return {
    applied: recorded.filter((name) => known.has(name)),
    pending: files.filter((name) => !recorded.includes(name)),
    unknown: recorded.filter((name) => !known.has(name)),
  };
}

export async function runMigrations(pg: Pool = getPool()): Promise<string[]> {
  const lock = await pg.connect();
  let lockAcquired = false;
  try {
    // The database lock protects releases from a second runner outside this
    // repository (for example, a hosting pre-deploy hook racing GitHub Actions).
    const { rows } = await lock.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [MIGRATION_LOCK_NAME],
    );
    lockAcquired = rows[0]?.acquired === true;
    if (!lockAcquired) {
      throw new Error('Another database migration is already running.');
    }

    const status = await inspectMigrations(pg);
    if (status.unknown.length > 0) {
      throw new Error(
        `Database contains migration records missing from this release: ${status.unknown.join(', ')}`,
      );
    }

    const ran: string[] = [];

    for (const file of status.pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

      await withTransaction(pg, async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      });

      ran.push(file);
    }

    return ran;
  } finally {
    try {
      if (lockAcquired) {
        await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME]);
      }
    } finally {
      lock.release();
    }
  }
}

/** `npm run migrate` — the deploy step, when MIGRATE_ON_BOOT=false. */
async function main(): Promise<void> {
  const pool = getPool();
  try {
    const ran = await runMigrations(pool);
    if (ran.length === 0) {
      console.log('Schema is up to date.');
    } else {
      for (const name of ran) console.log(`Applied ${name}`);
    }

    // The runtime role belongs to the same step: the policies applied above are
    // inert against a superuser, and this connection is the only one privileged
    // enough to create the role they do apply to.
    const appUrl = process.env.DATABASE_APP_URL;
    if (appUrl) {
      await provisionAppRole(pool, appUrl);
      console.log(`Runtime role ${parseAppRole(appUrl).role} provisioned.`);
    } else {
      console.log(
        'DATABASE_APP_URL is not set — no runtime role provisioned, and row-level ' +
          'security will not apply to a connection made with DATABASE_URL.',
      );
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
