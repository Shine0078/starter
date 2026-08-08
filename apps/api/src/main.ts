import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { loadConfig } from './config';
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
    const applied = await runMigrations(getPool(config.databaseUrl));
    logger.log(
      applied.length === 0 ? 'Schema up to date.' : `Applied migrations: ${applied.join(', ')}`,
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.setGlobalPrefix('api', { exclude: ['healthz'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Dev-only CORS. Phase 1 replaces this with an explicit origin allowlist —
  // a wide-open CORS policy on a finance API is not something to ship.
  app.enableCors({ origin: true, credentials: true });

  // The developer dashboard. Not the product UI — that is the Flutter app.
  app.useStaticAssets(join(__dirname, '..', 'public'));

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
  logger.log(`Dashboard  http://localhost:${PORT}/`);
  logger.log(`Health     http://localhost:${PORT}/healthz`);
}

void bootstrap();
