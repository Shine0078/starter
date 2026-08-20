import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

import { loadConfig, resetConfigForTests } from '../src/config';
import { installHttpControls } from '../src/infra/http/controls';

describe('HTTP controls', () => {
  it('sets HSTS only in production', async () => {
    resetConfigForTests();
    process.env.NODE_ENV = 'production';
    process.env.STORE = 'postgres';
    process.env.DATABASE_APP_URL = 'postgresql://finverse_app:secret@db.example/finverse';
    process.env.MIGRATE_ON_BOOT = 'false';
    process.env.JWT_SECRET = 'a-production-secret-that-is-longer-than-thirty-two-characters';
    process.env.CORS_ORIGINS = 'https://app.finverse.example';
    process.env.LEGAL_TERMS_VERSION = 'terms-2026-08';
    process.env.LEGAL_TERMS_URL = 'https://finverse.example/legal/terms';
    process.env.LEGAL_PRIVACY_VERSION = 'privacy-2026-08';
    process.env.LEGAL_PRIVACY_URL = 'https://finverse.example/legal/privacy';
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    process.env.GIT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;
    delete process.env.PLAID_ENVIRONMENT;

    const app = express();
    installHttpControls(app as never, loadConfig());
    app.get('/api/categories', (_req, res) => res.json({ ok: true }));

    const response = await request(app).get('/api/categories').expect(200);
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
