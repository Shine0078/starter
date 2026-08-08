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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';

/** Fixed, so `npm run db:start` gives a predictable DATABASE_URL to paste. */
const SERVE_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const USER = 'finverse';
const PASSWORD = 'finverse_dev_only';
const DATABASE = 'finverse';

function connectionString(port: number): string {
  return `postgresql://${USER}:${PASSWORD}@localhost:${port}/${DATABASE}`;
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

  // A fresh data directory per run. Tests that depend on state left behind by a
  // previous run pass locally and fail in CI; making that impossible is worth
  // the couple of seconds initdb costs.
  const dataDir = mkdtempSync(join(tmpdir(), 'finverse-pg-'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
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
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DATABASE);
  console.log(`PostgreSQL ready: ${CONNECTION_STRING}`);

  if (serveOnly) {
    console.log('Leave this running; press Ctrl+C to stop and discard the data.');
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
      DATABASE_URL: CONNECTION_STRING,
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
