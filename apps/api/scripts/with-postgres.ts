/**
 * Runs a command against a throwaway local PostgreSQL.
 *
 *   npm run test:db --workspace @finverse/api      # contract suite against a real DB
 *   npm run db:start --workspace @finverse/api     # leave one running for `npm run dev`
 *
 * Why this exists: Docker Desktop does not start reliably on every developer
 * machine (it fails on the maintainer's with a stale-socket error), and a
 * database test that is skipped is a database test nobody notices has stopped
 * running. `embedded-postgres` unpacks the official PostgreSQL binaries and
 * runs them directly, so the contract suite is one command with no daemon,
 * no container runtime, and no privileges.
 *
 * CI does not use this — it gets a `postgres` service container, which is
 * faster there and exercises a more production-like setup. Both paths set
 * TEST_DATABASE_URL, so the suite itself cannot tell the difference.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

/** Fixed, so `npm run db:start` gives a predictable DATABASE_URL to paste. */
const SERVE_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const USER = 'finverse';
const PASSWORD = 'finverse_dev_only';
const DATABASE = 'finverse';

/**
 * The least-privileged runtime role. It is not created here — the migration
 * step is, so `provisionAppRole` runs where the schema does — but the URL has to
 * agree with test/pg-harness.ts, which is what creates it.
 */
const APP_USER = 'finverse_app';
const APP_PASSWORD = 'finverse_app_dev_only';

function connectionString(port: number, user = USER, password = PASSWORD): string {
  return `postgresql://${user}:${password}@localhost:${port}/${DATABASE}`;
}

/** Asks the OS for a free port by binding one and immediately releasing it. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const serveOnly = args[0] === '--serve';

  // `--serve` keeps its data; a test run never does.
  //
  // Those are opposite requirements and both are correct. A test that depends
  // on state a previous run left behind passes locally and fails in CI, so the
  // suite gets a throwaway directory every time. Someone actually using the app
  // on their own machine wants the opposite: their accounts and budgets still
  // there tomorrow. Deleting a developer's data because the test harness needs
  // a clean slate is not a trade worth making.
  const persist = serveOnly && !args.includes('--ephemeral');

  // Test runs take an ephemeral port. A previous run that was interrupted can
  // leave a postgres process holding the fixed one, and the failure that
  // produces is an unhelpful "undefined" rather than "port in use".
  const explicitPort = process.env.EMBEDDED_PG_PORT;
  const PORT =
    serveOnly || explicitPort ? SERVE_PORT : await freePort();

  if (!(await isPortFree(PORT))) {
    throw new Error(
      `Port ${PORT} is already in use. A previous run may have left a postgres ` +
        `process behind — stop it, or set EMBEDDED_PG_PORT to something else.`,
    );
  }

  const CONNECTION_STRING = connectionString(PORT);
  const APP_CONNECTION_STRING = connectionString(PORT, APP_USER, APP_PASSWORD);

  // Persistent runs keep their cluster inside the repo (gitignored) so it is
  // obvious where the data lives and easy to throw away deliberately. Test runs
  // get a throwaway directory in the OS temp dir.
  const dataDir = persist
    ? join(__dirname, '..', '.postgres-data')
    : mkdtempSync(join(tmpdir(), 'finverse-pg-'));

  const alreadyInitialised = persist && existsSync(join(dataDir, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: persist,
    onLog: () => {},
  });

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      await pg.stop();
    } catch {
      // Already gone; nothing useful to do while shutting down.
    }
    // Never delete a persistent cluster. That directory is the user's data.
    if (persist) return;
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows sometimes holds a lock briefly after shutdown. The directory is
      // in the OS temp dir, so leaving it is harmless.
    }
  };

  process.on('SIGINT', () => void stop().then(() => process.exit(130)));
  process.on('SIGTERM', () => void stop().then(() => process.exit(143)));

  console.log(`Starting PostgreSQL on port ${PORT}...`);

  // initdb only on a directory that has never been one. Re-running it against
  // an existing cluster is how you lose the data you were trying to keep.
  if (!alreadyInitialised) await pg.initialise();
  await pg.start();

  // Already there on every run after the first, and that is not an error.
  try {
    await pg.createDatabase(DATABASE);
  } catch (error) {
    if (!alreadyInitialised) throw error;
  }

  console.log(`PostgreSQL ready: ${CONNECTION_STRING}`);

  if (serveOnly) {
    console.log('');
    console.log(
      persist
        ? `Data persists in ${dataDir}`
        : 'Data is discarded when this stops (--ephemeral).',
    );
    console.log('');
    console.log('For `npm run dev`, set both — the second is the role row-level');
    console.log('security applies to, and the API creates it on boot:');
    console.log(`  DATABASE_URL=${CONNECTION_STRING}`);
    console.log(`  DATABASE_APP_URL=${APP_CONNECTION_STRING}`);
    console.log('');
    console.log('Leave this running; press Ctrl+C to stop.');
    // Hold the process open without spinning.
    await new Promise(() => {});
    return;
  }

  const [command, ...rest] = args;
  if (!command) {
    await stop();
    throw new Error('Usage: with-postgres.ts [--serve | <command> [args...]]');
  }

  const child = spawn(command, rest, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      TEST_DATABASE_URL: CONNECTION_STRING,
      TEST_DATABASE_APP_URL: APP_CONNECTION_STRING,
      DATABASE_URL: CONNECTION_STRING,
      DATABASE_APP_URL: APP_CONNECTION_STRING,
    },
  });

  const code = await new Promise<number>((resolve) => {
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', () => resolve(1));
  });

  await stop();
  process.exit(code);
}

void main().catch(async (error: unknown) => {
  console.error(error);
  process.exit(1);
});
