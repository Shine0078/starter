import { randomBytes } from 'node:crypto';

export type StoreDriver = 'postgres' | 'memory';

export interface LegalDocumentConfig {
  version: string;
  url: string;
}

export interface LegalConfig {
  /** Registration is gated only when both reviewed documents are configured. */
  registrationRequired: boolean;
  terms: LegalDocumentConfig | null;
  privacyNotice: LegalDocumentConfig | null;
}

export interface BillingConfig {
  /** Where the hosted checkout returns a customer who paid. */
  successUrl: string;
  /** …and one who backed out. */
  cancelUrl: string;
  /** Where the provider's management portal returns them. */
  portalReturnUrl: string;
}

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
  /** Versioned legal documents whose exact versions must be accepted at registration. */
  legal: LegalConfig;
  /** Return URLs for hosted checkout and the billing portal. */
  billing: BillingConfig;
}

/**
 * The sample dashboard fabricates a ledger, so it is safe only with the
 * explicitly data-losing in-memory adapter. Keeping this decision pure makes
 * the server guard easy to test without booting Nest.
 */
export function shouldServeDevelopmentDashboard(
  config: Pick<AppConfig, 'isProduction' | 'store'>,
): boolean {
  return !config.isProduction && config.store === 'memory';
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

function legalDocument(
  versionName: string,
  urlName: string,
): LegalDocumentConfig | null {
  const version = process.env[versionName]?.trim();
  const url = process.env[urlName]?.trim();

  if (!version && !url) return null;
  if (!version || !url) {
    throw new Error(`${versionName} and ${urlName} must be configured together.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(version)) {
    throw new Error(
      `${versionName} must be 1-100 characters using letters, numbers, dot, underscore, or dash.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${urlName} must be a valid absolute HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${urlName} must use HTTPS.`);
  }

  return { version, url: parsed.toString() };
}

function resolveLegalConfig(isProduction: boolean): LegalConfig {
  const terms = legalDocument('LEGAL_TERMS_VERSION', 'LEGAL_TERMS_URL');
  const privacyNotice = legalDocument(
    'LEGAL_PRIVACY_VERSION',
    'LEGAL_PRIVACY_URL',
  );

  if ((terms === null) !== (privacyNotice === null)) {
    throw new Error(
      'Terms and privacy notice must be configured together: set all four LEGAL_* variables.',
    );
  }
  if (isProduction && (!terms || !privacyNotice)) {
    throw new Error(
      'Production requires reviewed terms and privacy notice versions and HTTPS URLs ' +
        '(LEGAL_TERMS_VERSION, LEGAL_TERMS_URL, LEGAL_PRIVACY_VERSION, LEGAL_PRIVACY_URL).',
    );
  }

  return {
    registrationRequired: terms !== null && privacyNotice !== null,
    terms,
    privacyNotice,
  };
}

/**
 * Return URLs for the hosted checkout.
 *
 * These are validated rather than passed through because the provider will
 * redirect a browser to whatever we hand it. An unvalidated value from the
 * environment is one misconfiguration away from an open redirect that carries
 * the trust of a payment flow — the worst possible place to land a user on an
 * attacker's page.
 *
 * HTTPS is required in production and `http://localhost` is allowed outside it,
 * because a developer has no certificate and a real deployment has no excuse.
 */
function billingUrl(name: string, fallback: string, requireHttps: boolean): string {
  const raw = process.env[name]?.trim() || fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol === 'https:') return parsed.toString();
  if (parsed.protocol === 'http:' && isLocalhost && !requireHttps) return parsed.toString();

  throw new Error(
    `${name} must use HTTPS${requireHttps ? '' : ' (or http://localhost in development)'}.`,
  );
}

/**
 * HTTPS is demanded only when billing is actually switched on, and the
 * localhost defaults stand otherwise.
 *
 * A deployment that sells nothing has no checkout to return from, and forcing
 * it to invent three URLs to boot would be configuration for its own sake. The
 * moment STRIPE_SECRET_KEY is present these become real redirect targets that a
 * browser is sent to after a payment, and then nothing but HTTPS will do.
 */
function resolveBillingConfig(isProduction: boolean, port: number, billingEnabled: boolean): BillingConfig {
  const base = `http://localhost:${port}`;
  const requireHttps = isProduction && billingEnabled;
  return {
    successUrl: billingUrl('BILLING_SUCCESS_URL', `${base}/billing/success`, requireHttps),
    cancelUrl: billingUrl('BILLING_CANCEL_URL', `${base}/billing/cancel`, requireHttps),
    portalReturnUrl: billingUrl('BILLING_PORTAL_RETURN_URL', `${base}/billing`, requireHttps),
  };
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

  const mfaKey = process.env.MFA_ENCRYPTION_KEY;
  if (isProduction && !mfaKey) {
    throw new Error('Production requires MFA_ENCRYPTION_KEY for encrypted authenticator secrets.');
  }
  if (mfaKey) {
    const decoded = Buffer.from(mfaKey, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== mfaKey) {
      throw new Error('MFA_ENCRYPTION_KEY must be canonical base64 encoding exactly 32 bytes.');
    }
  }

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

  const port = integerInRange('PORT', process.env.PORT, 3000, 65_535);

  // Half-configured billing charges customers and never entitles them, so the
  // adapter refuses to construct in that state. Checking here as well means the
  // process fails at boot rather than on the first checkout attempt.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_SECRET_KEY requires STRIPE_WEBHOOK_SECRET.');
  }
  if (isProduction && stripeKey?.startsWith('sk_test_')) {
    throw new Error('Production must not run on a Stripe test key.');
  }

  const plaidConfigured = Boolean(process.env.PLAID_CLIENT_ID || process.env.PLAID_SECRET);
  if (isProduction && plaidConfigured && process.env.PLAID_ENVIRONMENT !== 'production') {
    throw new Error(
      'Production Plaid credentials require PLAID_ENVIRONMENT=production. ' +
        'Refusing to run a sellable deployment against Sandbox data.',
    );
  }

  return {
    port,
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
    legal: resolveLegalConfig(isProduction),
    billing: resolveBillingConfig(isProduction, port, Boolean(stripeKey)),
  };
}
