import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, resetConfigForTests } from '../src/config';

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
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function productionBase(): void {
  process.env.NODE_ENV = 'production';
  process.env.STORE = 'postgres';
  delete process.env.DATABASE_URL;
  process.env.DATABASE_APP_URL = 'postgresql://finverse_app:secret@db.example/finverse';
  process.env.MIGRATE_ON_BOOT = 'false';
  process.env.JWT_SECRET = 'a-production-secret-that-is-longer-than-thirty-two-characters';
  process.env.CORS_ORIGINS = 'https://app.finverse.example';
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
});
