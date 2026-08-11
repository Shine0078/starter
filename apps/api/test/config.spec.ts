import { afterEach, describe, expect, it } from 'vitest';

import {
  loadConfig,
  resetConfigForTests,
  shouldServeDevelopmentDashboard,
  type AppConfig,
} from '../src/config';

const KEYS = [
  'NODE_ENV',
  'STORE',
  'DATABASE_URL',
  'DATABASE_APP_URL',
  'MIGRATE_ON_BOOT',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'PORT',
  'TRUST_PROXY_HOPS',
  'METRICS_TOKEN',
  'LEGAL_TERMS_VERSION',
  'LEGAL_TERMS_URL',
  'LEGAL_PRIVACY_VERSION',
  'LEGAL_PRIVACY_URL',
  'MFA_ENCRYPTION_KEY',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENVIRONMENT',
  'PLAID_IOS_REDIRECT_URI',
  'IOS_TEAM_ID',
  'WEBAUTHN_ENABLED',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_ORIGIN',
  'WEBAUTHN_RP_NAME',
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

// A clean production baseline. Anything not explicitly set here must be
// unset so a developer's local `.env` (which loads before the test module
// imports its first config dependency) cannot mask the guarded behaviour
// the test intends to assert. Tests that exercise Plaid/iOS rules set
// them explicitly after calling this.
function productionBase(): void {
  process.env.NODE_ENV = 'production';
  process.env.STORE = 'postgres';
  delete process.env.DATABASE_URL;
  process.env.DATABASE_APP_URL = 'postgresql://finverse_app:secret@db.example/finverse';
  process.env.MIGRATE_ON_BOOT = 'false';
  process.env.JWT_SECRET = 'a-production-secret-that-is-longer-than-thirty-two-characters';
  process.env.CORS_ORIGINS = 'https://app.finverse.example';
  process.env.LEGAL_TERMS_VERSION = 'terms-2026-08';
  process.env.LEGAL_TERMS_URL = 'https://finverse.example/legal/terms';
  process.env.LEGAL_PRIVACY_VERSION = 'privacy-2026-08';
  process.env.LEGAL_PRIVACY_URL = 'https://finverse.example/legal/privacy';
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PLAID_ENVIRONMENT;
  delete process.env.PLAID_IOS_REDIRECT_URI;
  delete process.env.IOS_TEAM_ID;
  delete process.env.WEBAUTHN_ENABLED;
  delete process.env.WEBAUTHN_RP_ID;
  delete process.env.WEBAUTHN_ORIGIN;
  delete process.env.WEBAUTHN_RP_NAME;
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetConfigForTests();
});

describe.sequential('production configuration', () => {
  it.each<[Pick<AppConfig, 'isProduction' | 'store'>, boolean]>([
    [{ isProduction: false, store: 'memory' }, true],
    [{ isProduction: false, store: 'postgres' }, false],
    [{ isProduction: true, store: 'postgres' }, false],
  ])(
    'serves the mock dashboard only for in-memory development',
    (config, expected) => {
      expect(shouldServeDevelopmentDashboard(config)).toBe(expected);
    },
  );

  it('runs with only the restricted runtime database credential', () => {
    productionBase();
    process.env.TRUST_PROXY_HOPS = '1';

    const config = loadConfig();
    expect(config.databaseUrl).toBeUndefined();
    expect(config.appDatabaseUrl).toContain('finverse_app');
    expect(config.trustedProxyHops).toBe(1);
  });

  it('refuses the data-losing in-memory store', () => {
    productionBase();
    process.env.STORE = 'memory';
    expect(() => loadConfig()).toThrow(/production requires STORE=postgres/i);
  });

  it('refuses to serve requests as the schema owner', () => {
    productionBase();
    delete process.env.DATABASE_APP_URL;
    process.env.DATABASE_URL = 'postgresql://owner:secret@db.example/finverse';
    expect(() => loadConfig()).toThrow(/DATABASE_APP_URL/);
  });

  it('refuses migrations during multi-instance startup', () => {
    productionBase();
    process.env.MIGRATE_ON_BOOT = 'true';
    process.env.DATABASE_URL = 'postgresql://owner:secret@db.example/finverse';
    expect(() => loadConfig()).toThrow(/MIGRATE_ON_BOOT=false/);
  });

  it.each([
    ['PORT', 'NaN'],
    ['PORT', '70000'],
    ['TRUST_PROXY_HOPS', '-1'],
  ])('rejects invalid %s', (key, value) => {
    productionBase();
    process.env[key] = value;
    expect(() => loadConfig()).toThrow(new RegExp(key));
  });

  it('refuses production without reviewed legal documents', () => {
    productionBase();
    delete process.env.LEGAL_PRIVACY_URL;
    expect(() => loadConfig()).toThrow(/LEGAL_PRIVACY/);
  });

  it('refuses production without an MFA encryption key', () => {
    productionBase();
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(() => loadConfig()).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it('refuses a malformed MFA encryption key', () => {
    productionBase();
    process.env.MFA_ENCRYPTION_KEY = 'not-a-key';
    expect(() => loadConfig()).toThrow(/exactly 32 bytes/);
  });

  it('refuses non-HTTPS legal document URLs', () => {
    productionBase();
    process.env.LEGAL_TERMS_URL = 'http://finverse.example/legal/terms';
    expect(() => loadConfig()).toThrow(/LEGAL_TERMS_URL must use HTTPS/);
  });

  it('refuses to run production Plaid credentials against Sandbox', () => {
    productionBase();
    process.env.PLAID_CLIENT_ID = 'client-id';
    process.env.PLAID_SECRET = 'secret';
    process.env.PLAID_ENVIRONMENT = 'sandbox';
    expect(() => loadConfig()).toThrow(/PLAID_ENVIRONMENT=production/);
  });

  it('accepts a sufficiently random metrics bearer token', () => {
    productionBase();
    process.env.METRICS_TOKEN = 'metrics-token-that-is-long-enough';
    expect(loadConfig().metricsToken).toBe('metrics-token-that-is-long-enough');
  });

  it('rejects a weak metrics bearer token', () => {
    productionBase();
    process.env.METRICS_TOKEN = 'too-short';
    expect(() => loadConfig()).toThrow(/METRICS_TOKEN/);
  });

  it('builds the iOS Universal Link association from the registered redirect', () => {
    productionBase();
    process.env.PLAID_IOS_REDIRECT_URI = 'https://api.finverse.example/plaid/';
    process.env.IOS_TEAM_ID = 'A1B2C3D4E5';

    expect(loadConfig().iosUniversalLink).toEqual({
      redirectUri: 'https://api.finverse.example/plaid/',
      host: 'api.finverse.example',
      pathPrefix: '/plaid/',
      teamId: 'A1B2C3D4E5',
      appId: 'A1B2C3D4E5.com.finverse.finance',
    });
  });

  it('refuses a partial iOS Universal Link configuration', () => {
    productionBase();
    process.env.PLAID_IOS_REDIRECT_URI = 'https://api.finverse.example/plaid/';
    expect(() => loadConfig()).toThrow(/must be configured together/);
  });

  it('leaves passkeys off until explicitly enabled', () => {
    productionBase();
    expect(loadConfig().webauthn).toBeUndefined();
  });

  it('requires a complete relying-party configuration to enable passkeys', () => {
    productionBase();
    process.env.WEBAUTHN_ENABLED = 'true';
    process.env.WEBAUTHN_RP_ID = 'api.finverse.example';
    expect(() => loadConfig()).toThrow(/WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN/);
  });

  it('requires HTTPS and a matching origin for passkeys in production', () => {
    productionBase();
    process.env.WEBAUTHN_ENABLED = 'true';
    process.env.WEBAUTHN_RP_ID = 'api.finverse.example';
    process.env.WEBAUTHN_ORIGIN = 'http://api.finverse.example';
    expect(() => loadConfig()).toThrow(/must use HTTPS/);

    productionBase();
    process.env.WEBAUTHN_ENABLED = 'true';
    process.env.WEBAUTHN_RP_ID = 'api.finverse.example';
    process.env.WEBAUTHN_ORIGIN = 'https://app.finverse.example';
    expect(() => loadConfig()).toThrow(/WEBAUTHN_RP_ID must equal/);
  });

  it('builds a valid passkey configuration when fully supplied', () => {
    productionBase();
    process.env.WEBAUTHN_ENABLED = 'true';
    process.env.WEBAUTHN_RP_ID = 'api.finverse.example';
    process.env.WEBAUTHN_ORIGIN = 'https://api.finverse.example';
    process.env.WEBAUTHN_RP_NAME = 'FINVERSE';
    expect(loadConfig().webauthn).toEqual({
      rpId: 'api.finverse.example',
      origin: 'https://api.finverse.example',
      rpName: 'FINVERSE',
    });
  });
});
