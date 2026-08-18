/**
 * Public association documents must be reachable without the /api prefix.
 */
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';
process.env.PLAID_IOS_REDIRECT_URI = 'https://api.finverse.example/plaid/';
process.env.IOS_TEAM_ID = 'A1B2C3D4E5';
process.env.ANDROID_CERT_FINGERPRINTS =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

describe('well-known association documents', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    const { resetConfigForTests } = await import('../src/config');
    resetConfigForTests();
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { loadConfig } = await import('../src/config');
    const { installHttpControls } = await import('../src/infra/http/controls');
    installHttpControls(app as NestExpressApplication, loadConfig());
    app.setGlobalPrefix('api', {
      exclude: [
        'healthz',
        { path: '.well-known/apple-app-site-association', method: RequestMethod.GET },
        { path: 'apple-app-site-association', method: RequestMethod.GET },
        { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
      ],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    http = await app.getUrl().then((url) => url.replace('[::1]', '127.0.0.1'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves AASA with webcredentials outside /api', async () => {
    const response = await request(http).get('/.well-known/apple-app-site-association').expect(200);
    expect(response.body.webcredentials.apps).toEqual(['A1B2C3D4E5.com.finverse.finance']);
    await request(http).get('/apple-app-site-association').expect(200);
  });

  it('serves Digital Asset Links outside /api when fingerprints are configured', async () => {
    const response = await request(http).get('/.well-known/assetlinks.json').expect(200);
    expect(response.body[0].target.package_name).toBe('com.finverse.finance');
    expect(response.body[0].relation).toContain('delegate_permission/common.get_login_creds');
  });
});
