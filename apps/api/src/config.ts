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

export interface IosUniversalLinkConfig {
  /** The exact HTTPS return URL registered with Plaid. */
  redirectUri: string;
  /** Host used by Apple's associated-domains entitlement. */
  host: string;
  /** Path prefix handled by the FINVERSE app, including its trailing slash. */
  pathPrefix: string;
  /** Apple developer team identifier used to build the AASA app id. */
  teamId: string;
  appId: string;
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
  /** Optional bearer token for the internal Prometheus scrape endpoint. */
  metricsToken: string | undefined;
  /** Optional iOS Universal Link registration for Plaid OAuth. */
  iosUniversalLink: IosUniversalLinkConfig | undefined;
  /** Optional passkey (WebAuthn) relying-party configuration. */
  webauthn: WebAuthnConfig | undefined;
  /** Privacy-preserving compromised-password screening configuration. */
  passwordBreachCheck: PasswordBreachCheckConfig;
  /** Remote-notification delivery stays disabled until credentials are supplied. */
  push: PushConfig;
  /** Exact git SHA of the running image. Required in production so / and HTTP 200 cannot hide the wrong app. */
  releaseSha: string | null;
}

export interface WebAuthnConfig {
  rpId: string;
  /** Exact clientData.origin values the verifier accepts. */
  origins: string[];
  /** First allowlisted origin, kept for callers that still read a single value. */
  origin: string;
  rpName: string;
}

export type PasswordBreachCheckMode = 'disabled' | 'best_effort' | 'required';

export interface PasswordBreachCheckConfig {
  mode: PasswordBreachCheckMode;
}

export interface PushConfig {
  /** JSON service-account document stored only in a deployment secret manager. */
  fcmCredentialsJson: string | undefined;
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


function resolveReleaseSha(isProduction: boolean): string | null {
  const raw = (process.env.GIT_SHA ?? process.env.COMMIT_SHA ?? '').trim();
  if (!raw) {
    if (isProduction) {
      throw new Error('Production requires GIT_SHA so a wrong process cannot hide behind HTTP 200.');
    }
    return null;
  }
  if (!/^[0-9a-f]{7,40}$/i.test(raw)) {
    throw new Error('GIT_SHA must be a 7-40 character hexadecimal git SHA.');
  }
  return raw.toLowerCase();
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

function resolveMetricsToken(): string | undefined {
  const token = process.env.METRICS_TOKEN?.trim();
  if (!token) return undefined;
  if (token.length < 16 || token.length > 256) {
    throw new Error('METRICS_TOKEN must be between 16 and 256 characters when configured.');
  }
  return token;
}

function resolveIosUniversalLink(): IosUniversalLinkConfig | undefined {
  const rawRedirect = process.env.PLAID_IOS_REDIRECT_URI?.trim();
  const rawTeamId = process.env.IOS_TEAM_ID?.trim().toUpperCase();
  if (!rawRedirect && !rawTeamId) return undefined;
  if (!rawRedirect || !rawTeamId) {
    throw new Error(
      'PLAID_IOS_REDIRECT_URI and IOS_TEAM_ID must be configured together for iOS Universal Links.',
    );
  }
  if (!/^[A-Z0-9]{10}$/.test(rawTeamId)) {
    throw new Error('IOS_TEAM_ID must be the 10-character Apple Developer team id.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawRedirect);
  } catch {
    throw new Error('PLAID_IOS_REDIRECT_URI must be a valid absolute HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('PLAID_IOS_REDIRECT_URI must use HTTPS.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'PLAID_IOS_REDIRECT_URI must not include credentials, a query string, or a fragment.',
    );
  }
  const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!path) {
    throw new Error('PLAID_IOS_REDIRECT_URI must include a non-root callback path.');
  }
  const pathPrefix = `/${path}/`;
  return {
    redirectUri: parsed.toString(),
    host: parsed.host,
    pathPrefix,
    teamId: rawTeamId,
    appId: `${rawTeamId}.com.finverse.finance`,
  };
}

/**
 * Passkeys (WebAuthn). Gated off entirely unless WEBAUTHN_ENABLED=true — a
 * half-configured relying party would mint challenges that can never verify.
 * Passkeys also require a registered domain, which is why this stays an
 * explicit, documented owner gate rather than a default.
 */
function isWebAuthnHostname(value: string): boolean {
  if (!value || value.length > 253) return false;
  if (value.includes(':') || value.includes('/') || value.includes(' ')) return false;
  if (value.startsWith('.') || value.endsWith('.')) return false;
  if (value.toLowerCase() === 'localhost') return true;
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
    value,
  );
}

function hostMatchesWebAuthnRpId(hostname: string, rpId: string): boolean {
  const host = hostname.toLowerCase();
  const expected = rpId.toLowerCase();
  return host === expected || host.endsWith('.' + expected);
}

const ANDROID_APK_KEY_HASH = /^android:apk-key-hash:[A-Za-z0-9_-]{43}$/;

function parseWebAuthnOrigin(raw: string, isProduction: boolean, rpId: string): string {
  if (ANDROID_APK_KEY_HASH.test(raw)) return raw;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      'WEBAUTHN_ORIGIN entries must be absolute URLs or android:apk-key-hash:<sha256-base64url>.',
    );
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol === 'https:') {
    // HTTPS web origins are always acceptable when the host matches the RP ID.
  } else if (parsed.protocol === 'http:' && isLocalhost && !isProduction) {
    // Local development only.
  } else if (isProduction) {
    throw new Error('WEBAUTHN_ORIGIN must use HTTPS in production (or android:apk-key-hash).');
  } else {
    throw new Error(
      'WEBAUTHN_ORIGIN must use HTTPS, http://localhost, or android:apk-key-hash.',
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('WEBAUTHN_ORIGIN must not include credentials, a query string, or a fragment.');
  }
  if (!hostMatchesWebAuthnRpId(parsed.hostname, rpId)) {
    throw new Error(
      'Each HTTPS WEBAUTHN_ORIGIN host must equal WEBAUTHN_RP_ID or be a subdomain of it.',
    );
  }
  return parsed.origin;
}

function parseWebAuthnOrigins(raw: string, isProduction: boolean, rpId: string): string[] {
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('WEBAUTHN_ORIGIN must list at least one origin.');
  }
  const origins = parts.map((part) => parseWebAuthnOrigin(part, isProduction, rpId));
  return [...new Set(origins)];
}

function resolveWebAuthnConfig(isProduction: boolean): WebAuthnConfig | undefined {
  if (process.env.WEBAUTHN_ENABLED !== 'true') return undefined;

  const rpId = process.env.WEBAUTHN_RP_ID?.trim().toLowerCase();
  const originRaw = process.env.WEBAUTHN_ORIGIN?.trim();
  if (!rpId || !originRaw) {
    throw new Error(
      'WEBAUTHN_ENABLED=true requires WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN (e.g. WEBAUTHN_RP_ID=finverse.example, WEBAUTHN_ORIGIN=https://app.finverse.example,https://api.finverse.example).',
    );
  }
  if (!isWebAuthnHostname(rpId)) {
    throw new Error(
      'WEBAUTHN_RP_ID must be a hostname without a port or scheme (e.g. finverse.example).',
    );
  }

  const origins = parseWebAuthnOrigins(originRaw, isProduction, rpId);
  return {
    rpId,
    origins,
    origin: origins[0]!,
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || 'FINVERSE',
  };
}

/**
 * HIBP's range API does not receive a password or its complete hash. New
 * production credentials must be screened, while ordinary local/test runs
 * stay offline and deterministic unless an engineer opts into best-effort
 * checks. A production process may not silently downgrade this control.
 */
function resolvePasswordBreachCheck(isProduction: boolean): PasswordBreachCheckConfig {
  const raw = process.env.HIBP_PASSWORD_CHECK?.trim().toLowerCase();
  const mode = raw || (isProduction ? 'required' : 'disabled');
  if (!['disabled', 'best_effort', 'required'].includes(mode)) {
    throw new Error('HIBP_PASSWORD_CHECK must be disabled, best_effort, or required.');
  }
  if (isProduction && mode !== 'required') {
    throw new Error('Production requires HIBP_PASSWORD_CHECK=required for compromised-password screening.');
  }
  return { mode: mode as PasswordBreachCheckMode };
}

function resolvePushConfig(): PushConfig {
  const credentials = process.env.FCM_CREDENTIALS_JSON?.trim();
  if (!credentials) return { fcmCredentialsJson: undefined };
  // A service-account JSON document is normally only a few KiB. This bound
  // catches accidental file pastes without ever printing its secret contents.
  if (credentials.length > 65_536) {
    throw new Error('FCM_CREDENTIALS_JSON is unexpectedly large.');
  }
  try {
    const parsed: unknown = JSON.parse(credentials);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
  } catch {
    throw new Error('FCM_CREDENTIALS_JSON must be a JSON object.');
  }
  return { fcmCredentialsJson: credentials };
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
    if (databaseUrl) {
      try {
        const ownerUser = decodeURIComponent(new URL(databaseUrl).username);
        const appUser = decodeURIComponent(new URL(appDatabaseUrl).username);
        if (ownerUser && appUser && ownerUser === appUser) {
          throw new Error(
            'Production DATABASE_APP_URL must use a different role than DATABASE_URL.',
          );
        }
      } catch (error) {
        if (error instanceof Error && /must use a different role/.test(error.message)) throw error;
      }
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
    metricsToken: resolveMetricsToken(),
    iosUniversalLink: resolveIosUniversalLink(),
    webauthn: resolveWebAuthnConfig(isProduction),
    passwordBreachCheck: resolvePasswordBreachCheck(isProduction),
    push: resolvePushConfig(),
    releaseSha: resolveReleaseSha(isProduction),
  };
}
