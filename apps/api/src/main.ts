import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

import { AppModule } from './app.module';

const PORT = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
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

  await app.listen(PORT, '0.0.0.0');

  const logger = new Logger('bootstrap');
  logger.log(`FINVERSE API listening on http://localhost:${PORT}`);
  logger.log(`Dashboard  http://localhost:${PORT}/`);
  logger.log(`Health     http://localhost:${PORT}/healthz`);
}

void bootstrap();
