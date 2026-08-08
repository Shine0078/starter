/**
 * Shared setup for the suites that need a real database.
 *
 * Two connections, deliberately. TEST_DATABASE_URL is the schema owner and runs
 * migrations and truncations; the stores under test connect as the restricted
 * runtime role, because that is the only way the row-level security policies are
 * in force. Running the contract suite as the owner would pass identically
 * against a database with no policies at all, which is the failure mode
 * docs/07-session-notes.md warns about.
 */

import type { Pool } from 'pg';

import { provisionAppRole } from '../src/infra/postgres/app-role';
import { runMigrations } from '../src/infra/postgres/migrate';
import { createPool, getPool } from '../src/infra/postgres/pool';

export const OWNER_URL = process.env.TEST_DATABASE_URL;

/** Matches the password the harness and CI use. Nothing here is a secret. */
const APP_ROLE = 'finverse_app';
const APP_PASSWORD = 'finverse_app_dev_only';

/**
 * The runtime URL, taken from the environment when set and otherwise derived
 * from the owner's by swapping the credentials. Deriving it means every way of
 * getting a database — the embedded harness, CI's service container, a
 * docker-compose instance — exercises RLS without extra configuration, and the
 * role itself is created below.
 */
export function appUrlFrom(ownerUrl: string): string {
  const configured = process.env.TEST_DATABASE_APP_URL;
  if (configured) return configured;

  const url = new URL(ownerUrl);
  url.username = APP_ROLE;
  url.password = APP_PASSWORD;
  return url.toString();
}

export interface PgHarness {
  /** Schema owner. Migrations, truncation, and anything RLS should not see. */
  owner: Pool;
  /** The restricted runtime role. Everything under test. */
  app: Pool;
  appUrl: string;
  close(): Promise<void>;
}

/**
 * Migrates, provisions the runtime role, and hands back both pools.
 *
 * The owner pool is the module-level singleton so that `closePool()` still
 * disposes of it; the app pool is separate and owned by the caller.
 */
export async function startPgHarness(ownerUrl: string): Promise<PgHarness> {
  const owner = getPool(ownerUrl);
  await runMigrations(owner);

  const appUrl = appUrlFrom(ownerUrl);
  await provisionAppRole(owner, appUrl);

  const app = createPool(appUrl);

  return {
    owner,
    app,
    appUrl,
    async close() {
      await app.end();
    },
  };
}
