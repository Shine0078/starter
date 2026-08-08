import { randomBytes } from 'node:crypto';

export type StoreDriver = 'postgres' | 'memory';

export interface AppConfig {
  port: number;
  store: StoreDriver;
  /** The schema owner. Migrations and role provisioning only. */
  databaseUrl: string | undefined;
  /** The least-privileged runtime connection, subject to the RLS policies in
   *  003_rls.sql. Absent means requests are served by the owner, which on most
   *  installs is a superuser — and a superuser bypasses every policy without
   *  saying so. core.module warns rather than failing, because a single-URL
   *  setup is a reasonable way to run locally. */
  appDatabaseUrl: string | undefined;
  /** Apply pending migrations on boot. Convenient in development; in
   *  production migrations should be a deploy step, not a startup side effect,
   *  so that two instances starting at once cannot race each other. */
  migrateOnBoot: boolean;
  /** Signs access tokens. See resolveJwtSecret for the sourcing rules. */
  jwtSecret: string;
  isProduction: boolean;
  /** Origins allowed to call the API from a browser. */
  corsOrigins: string[] | true;
  /** Number of reverse-proxy hops Express may trust when deriving the client IP. */
  trustedProxyHops: number;
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
  return process.env.DATABASE_URL || process.env.DATABASE_APP_URL ? 'postgres' : 'memory';
}

function integerInRange(name: string, raw: string | undefined, fallback: number, max: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}.`);
  }
  return value;
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
  const isProduction = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL;
  const appDatabaseUrl = process.env.DATABASE_APP_URL;
  const migrateOnBoot = process.env.MIGRATE_ON_BOOT !== 'false';

  if (store === 'postgres' && !databaseUrl && !appDatabaseUrl) {
    throw new Error(
      'STORE=postgres requires DATABASE_APP_URL for runtime or DATABASE_URL for local migrations.',
    );
  }

  if (migrateOnBoot && store === 'postgres' && !databaseUrl) {
    throw new Error('MIGRATE_ON_BOOT=true requires the schema-owner DATABASE_URL.');
  }

  if (isProduction) {
    if (store !== 'postgres') {
      throw new Error('Production requires STORE=postgres; the in-memory store loses user data.');
    }
    if (!appDatabaseUrl) {
      throw new Error(
        'Production requires DATABASE_APP_URL for the least-privileged RLS runtime role.',
      );
    }
    if (migrateOnBoot) {
      throw new Error(
        'Production requires MIGRATE_ON_BOOT=false; run migrations as a separate release step.',
      );
    }
  }

  return {
    port: integerInRange('PORT', process.env.PORT, 3000, 65_535),
    store,
    databaseUrl,
    appDatabaseUrl,
    migrateOnBoot,
    jwtSecret: resolveJwtSecret(isProduction),
    isProduction,
    corsOrigins: resolveCorsOrigins(isProduction),
    trustedProxyHops: integerInRange(
      'TRUST_PROXY_HOPS',
      process.env.TRUST_PROXY_HOPS,
      0,
      10,
    ),
  };
}
