import { randomBytes } from 'node:crypto';

export type StoreDriver = 'postgres' | 'memory';

export interface AppConfig {
  port: number;
  store: StoreDriver;
  databaseUrl: string | undefined;
  /** Apply pending migrations on boot. Convenient in development; in
   *  production migrations should be a deploy step, not a startup side effect,
   *  so that two instances starting at once cannot race each other. */
  migrateOnBoot: boolean;
  /** Signs access tokens. See resolveJwtSecret for the sourcing rules. */
  jwtSecret: string;
  isProduction: boolean;
  /** Origins allowed to call the API from a browser. */
  corsOrigins: string[] | true;
}

/**
 * The signing key.
 *
 * There is deliberately **no hardcoded fallback**. A default secret committed to
 * a repository is not a convenience, it is a universal forgery key for every
 * deployment that forgot to override it — anyone can mint a token for any user.
 *
 * In production the variable is required and the process refuses to start
 * without it. In development a random key is generated per boot, which means
 * restarting invalidates outstanding tokens. That is mildly annoying and much
 * safer than the alternative.
 */
function resolveJwtSecret(isProduction: boolean): string {
  const configured = process.env.JWT_SECRET;

  if (configured && configured.length >= 32) return configured;

  if (configured) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters (got ${configured.length}). ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  if (isProduction) {
    throw new Error(
      'JWT_SECRET is required in production. Refusing to start with a generated key, ' +
        'which would invalidate every session on restart and differ between instances.',
    );
  }

  return randomBytes(48).toString('base64url');
}

function resolveCorsOrigins(isProduction: boolean): string[] | true {
  const configured = process.env.CORS_ORIGINS?.trim();

  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (isProduction) {
    // Reflecting any origin on a finance API lets a malicious page make
    // credentialed cross-origin calls. Fail closed instead.
    throw new Error('CORS_ORIGINS is required in production (comma-separated allowlist).');
  }

  return true;
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

/**
 * Memoised, and it has to be.
 *
 * loadConfig() is called from the composition root, the health endpoint, and
 * bootstrap. In development the JWT secret is generated per process; if each
 * call produced a fresh one, a token signed by the issuer would fail
 * verification in the guard and every request would 401 for no visible reason.
 */
let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  cached = buildConfig();
  return cached;
}

/** Tests only: drop the memo so a new environment can be read. */
export function resetConfigForTests(): void {
  cached = null;
}

function buildConfig(): AppConfig {
  const store = readStoreDriver();

  if (store === 'postgres' && !process.env.DATABASE_URL) {
    throw new Error('STORE=postgres requires DATABASE_URL. Try `npm run infra:up`.');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    port: Number(process.env.PORT ?? 3000),
    store,
    databaseUrl: process.env.DATABASE_URL,
    migrateOnBoot: process.env.MIGRATE_ON_BOOT !== 'false',
    jwtSecret: resolveJwtSecret(isProduction),
    isProduction,
    corsOrigins: resolveCorsOrigins(isProduction),
  };
}
