export type StoreDriver = 'postgres' | 'memory';

export interface AppConfig {
  port: number;
  store: StoreDriver;
  databaseUrl: string | undefined;
  /** Apply pending migrations on boot. Convenient in development; in
   *  production migrations should be a deploy step, not a startup side effect,
   *  so that two instances starting at once cannot race each other. */
  migrateOnBoot: boolean;
}

function readStoreDriver(): StoreDriver {
  const explicit = process.env.STORE?.toLowerCase();
  if (explicit === 'postgres' || explicit === 'memory') return explicit;
  if (explicit) {
    throw new Error(`STORE must be "postgres" or "memory", received "${explicit}"`);
  }
  // Default to whatever the environment can actually support: Postgres when a
  // connection string is present, memory otherwise. This keeps `npm run dev`
  // working on a machine with no database while making persistence the norm
  // once one is configured.
  return process.env.DATABASE_URL ? 'postgres' : 'memory';
}

export function loadConfig(): AppConfig {
  const store = readStoreDriver();

  if (store === 'postgres' && !process.env.DATABASE_URL) {
    throw new Error('STORE=postgres requires DATABASE_URL. Try `npm run infra:up`.');
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    store,
    databaseUrl: process.env.DATABASE_URL,
    migrateOnBoot: process.env.MIGRATE_ON_BOOT !== 'false',
  };
}
