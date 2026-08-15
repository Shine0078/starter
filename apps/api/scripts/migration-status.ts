import '../src/env';

import { inspectMigrations } from '../src/infra/postgres/migrate';
import { getPool } from '../src/infra/postgres/pool';

async function main(): Promise<void> {
  const requireClean = process.argv.includes('--require-clean');
  const pool = getPool();

  try {
    const status = await inspectMigrations(pool);

    console.log(`Applied migrations: ${status.applied.length}`);
    console.log(`Pending migrations: ${status.pending.length}`);
    for (const name of status.pending) console.log(`  pending: ${name}`);

    if (status.unknown.length > 0) {
      for (const name of status.unknown) console.error(`  unknown: ${name}`);
      throw new Error(
        'The database records migrations that are absent from this release. Refusing to continue.',
      );
    }

    if (requireClean && status.pending.length > 0) {
      throw new Error('The database still has pending migrations.');
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
