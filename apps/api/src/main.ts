// First, and it has to be: loadConfig() is memoised and runs when the module
// graph below is initialised, so a .env read any later would be ignored.
import './env';
import 'reflect-metadata';

import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

import { AppModule } from './app.module';
import { loadConfig, shouldServeDevelopmentDashboard } from './config';
import { installHttpControls } from './infra/http/controls';
import { parseAppRole, provisionAppRole } from './infra/postgres/app-role';
import { closePool, getPool } from './infra/postgres/pool';
import { runMigrations } from './infra/postgres/migrate';

const config = loadConfig();
const PORT = config.port;

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');

  // Migrations run before the app starts so that no request can ever hit a
  // half-migrated schema. In production this belongs in the deploy pipeline —
  // set MIGRATE_ON_BOOT=false there, since two instances starting together
  // would otherwise race.
  if (config.store === 'postgres' && config.migrateOnBoot) {
    const admin = getPool(config.databaseUrl);
    const applied = await runMigrations(admin);
    logger.log(
      applied.length === 0 ? 'Schema up to date.' : `Applied migrations: ${applied.join(', ')}`,
    );

    // After the migrations, because the grants cover the tables they create.
    if (config.appDatabaseUrl) {
      await provisionAppRole(admin, config.appDatabaseUrl);
      logger.log(`Runtime role ${parseAppRole(config.appDatabaseUrl).role} provisioned.`);
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
    rawBody: true,
  });

  installHttpControls(app, config);
  app.setGlobalPrefix('api', {
    exclude: [
      'healthz',
      { path: '.well-known/apple-app-site-association', method: RequestMethod.GET },
      { path: 'apple-app-site-association', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Development may allow all origins; production configuration fails closed
  // unless CORS_ORIGINS contains an explicit allowlist.
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  // The compiled Flutter app is several megabytes of JavaScript and a
  // WebAssembly renderer, and served raw that is a blank screen for tens of
  // seconds on a phone — indistinguishable from a crash. Compression cuts it
  // by roughly four times.
  //
  // Scoped to the static bundle rather than applied globally: compressing API
  // responses that mix secrets with attacker-influenced content is the setup
  // for BREACH, and the bundle is where all the bytes actually are.
  app.use(['/app', '/dev'], compression());

  // The developer dashboard is mounted only for the in-memory development
  // adapter. It fabricates a sample ledger from the mock aggregator, so a
  // persistent deployment must never expose it just because NODE_ENV was
  // omitted or mistyped.
  const developmentDashboard = shouldServeDevelopmentDashboard(config);
  if (developmentDashboard) {
    app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/dev' });
  }

  // The Flutter app, compiled for the web, served from the same origin as the
  // API it talks to. Same-origin means no CORS to configure and no second host
  // to run, and it is what makes the phone-installable PWA a single URL.
  //
  // Optional by design: the directory only exists after `flutter build web`,
  // and the API must still boot without it. See docs/11-run-on-your-phone.md.
  const webAppDir = join(__dirname, '..', '..', 'mobile', 'build', 'web');
  const webAppBuilt = existsSync(join(webAppDir, 'index.html'));

  if (webAppBuilt) {
    app.useStaticAssets(webAppDir, { prefix: '/app' });

    // Flutter routes client-side, so a deep link or a hard refresh inside the
    // app asks the server for a path that does not exist on disk. Hand those
    // back index.html and let the app resolve them.
    app.use('/app', (request: Request, response: Response, next: NextFunction) => {
      if (request.method !== 'GET' || extname(request.path)) return next();
      response.sendFile(join(webAppDir, 'index.html'));
    });
  }

  // The root sends you to the real app when one is built. Only development
  // falls back to the mock-data dashboard; production fails closed if its
  // frontend bundle is missing.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path !== '/') return next();
    if (webAppBuilt) return response.redirect('/app/');
    if (developmentDashboard) return response.redirect('/dev/');
    return response.status(404).send('FINVERSE web app is not deployed.');
  });

  // Drain in-flight requests and close the pool on SIGTERM/SIGINT, so a
  // restart doesn't sever open connections mid-transaction.
  app.enableShutdownHooks();
  const shutdown = async (): Promise<void> => {
    await app.close();
    await closePool();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await app.listen(PORT, '0.0.0.0');

  logger.log(`FINVERSE API listening on http://localhost:${PORT}`);
  logger.log(`Store      ${config.store}`);
  logger.log(`Health     http://localhost:${PORT}/healthz`);
  if (developmentDashboard) {
    logger.log(`Dev tools  http://localhost:${PORT}/dev/  (sample data lives here)`);
  }
  if (webAppBuilt) {
    logger.log(`App        http://localhost:${PORT}/app/`);
  } else {
    logger.warn('No web build found — run `flutter build web` to serve the app at /app/.');
  }
}

void bootstrap();
