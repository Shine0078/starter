import { randomUUID } from 'node:crypto';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';

const requests = positiveInteger('LOAD_REQUESTS', 250);
const concurrency = positiveInteger('LOAD_CONCURRENCY', 10);
const p95LimitMs = positiveInteger('LOAD_P95_MS', 750);

guardDatabaseTarget();
process.env.NODE_ENV = 'test';
process.env.THROTTLE_DISABLED = 'true';
process.env.STORE ??= process.env.DATABASE_APP_URL || process.env.DATABASE_URL ? 'postgres' : 'memory';
process.env.JWT_SECRET ??= 'load-smoke-secret-at-least-32-characters-long';

const routes = [
  '/api/accounts',
  '/api/transactions?limit=50',
  '/api/budgets/progress',
  '/api/insights',
  '/api/subscriptions',
  '/api/health-score',
  '/api/cash-flow-forecast?days=30',
  '/api/notifications',
];

async function main(): Promise<void> {
  const [{ AppModule }, { loadConfig }, { installHttpControls }, { closePool }] =
    await Promise.all([
      import('../src/app.module'),
      import('../src/config'),
      import('../src/infra/http/controls'),
      import('../src/infra/postgres/pool'),
    ]);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { logger: false, rawBody: true },
  );

  try {
    installHttpControls(app, loadConfig());
    app.setGlobalPrefix('api', { exclude: ['healthz'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const address = await app.getUrl();
    const baseUrl = address.replace('[::1]', '127.0.0.1');
    const token = await createSeededUser(baseUrl);

    const latencies: number[] = [];
    const failures: Array<{ route: string; status: number }> = [];
    let cursor = 0;
    const started = performance.now();

    await Promise.all(
      Array.from({ length: Math.min(concurrency, requests) }, async () => {
        while (true) {
          const index = cursor;
          cursor += 1;
          if (index >= requests) return;
          const route = routes[index % routes.length]!;
          const requestStarted = performance.now();
          try {
            const response = await fetch(`${baseUrl}${route}`, {
              headers: { authorization: `Bearer ${token}` },
            });
            await response.arrayBuffer();
            if (!response.ok) failures.push({ route, status: response.status });
          } catch {
            failures.push({ route, status: 0 });
          } finally {
            latencies.push(performance.now() - requestStarted);
          }
        }
      }),
    );

    const elapsedMs = performance.now() - started;
    latencies.sort((a, b) => a - b);
    const report = {
      store: loadConfig().store,
      requests,
      concurrency: Math.min(concurrency, requests),
      failures: failures.length,
      throughputPerSecond: round((requests / elapsedMs) * 1_000),
      latencyMs: {
        p50: round(percentile(latencies, 0.5)),
        p95: round(percentile(latencies, 0.95)),
        p99: round(percentile(latencies, 0.99)),
        max: round(latencies.at(-1) ?? 0),
      },
      threshold: { p95Ms: p95LimitMs },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (failures.length > 0) {
      throw new Error(`Load smoke recorded ${failures.length} failed request(s).`);
    }
    if (report.latencyMs.p95 > p95LimitMs) {
      throw new Error(
        `Load smoke p95 ${report.latencyMs.p95} ms exceeded ${p95LimitMs} ms.`,
      );
    }
  } finally {
    await app.close();
    await closePool();
  }
}

async function createSeededUser(baseUrl: string): Promise<string> {
  const legal = await getJson<{
    registrationRequired: boolean;
    terms: { version: string } | null;
    privacyNotice: { version: string } | null;
  }>(`${baseUrl}/api/legal`);
  const acceptance = legal.registrationRequired
    ? {
        acceptedTerms: true,
        termsVersion: legal.terms!.version,
        acceptedPrivacyNotice: true,
        privacyVersion: legal.privacyNotice!.version,
      }
    : {};
  const registration = await postJson<{
    tokens: { accessToken: string };
  }>(`${baseUrl}/api/auth/register`, {
    email: `load-smoke-${randomUUID()}@example.invalid`,
    password: 'correct horse battery staple',
    ...acceptance,
  });
  // Postgres deployments refuse the in-memory sample ledger. An empty
  // authenticated account is enough to prove the restricted runtime role
  // can serve the read path under load.
  return registration.tokens.accessToken;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname} returned ${response.status}.`);
  return response.json() as Promise<T>;
}

async function postJson<T = unknown>(url: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${new URL(url).pathname} returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function guardDatabaseTarget(): void {
  const raw = process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL;
  if (!raw) return;
  const target = new URL(raw);
  const local = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
  if (process.env.LOAD_TEST_DATABASE !== 'true') {
    throw new Error(
      'A database URL is present. Set LOAD_TEST_DATABASE=true only for a disposable test database.',
    );
  }
  if (!local && process.env.LOAD_TEST_REMOTE !== 'true') {
    throw new Error(
      'Refusing to load a remote database. Use an isolated staging database and set LOAD_TEST_REMOTE=true.',
    );
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
