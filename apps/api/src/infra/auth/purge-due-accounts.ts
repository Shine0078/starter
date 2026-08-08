import { loadConfig } from '../../config';
import { closePool, getAppPool } from '../postgres/pool';
import { PostgresAccountDeletionStore } from './account-deletion-stores';

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.store !== 'postgres') {
    throw new Error('Account purging requires STORE=postgres and a persistent database.');
  }

  try {
    const purged = await new PostgresAccountDeletionStore(
      getAppPool(config.appDatabaseUrl),
    ).purgeDue(new Date());
    console.log(`Purged ${purged} account(s).`);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
