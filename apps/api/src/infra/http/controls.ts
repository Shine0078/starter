import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import type { AppConfig } from '../../config';
import { httpMetrics } from './metrics';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Provider-neutral HTTP controls installed before routes.
 *
 * Access logs deliberately contain no headers, query strings, request bodies,
 * user ids, merchant names, or amounts. Those are unnecessary for operations
 * and are exactly the fields a finance service must keep out of log storage.
 */
export function installHttpControls(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.trustedProxyHops);

  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header('x-request-id');
    const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    const started = process.hrtime.bigint();

    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
    if (request.path.startsWith('/api/')) response.setHeader('cache-control', 'no-store');
    if (config.isProduction) {
      response.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }

    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      httpMetrics.record({
        method: request.method,
        // Never use a raw URL as a metric label. Route templates keep the
        // series bounded and avoid turning user-controlled ids into telemetry.
        route: request.route?.path ?? 'unmatched',
        statusCode: response.statusCode,
        durationMs,
      });
      if (process.env.NODE_ENV === 'test') return;
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: response.statusCode >= 500 ? 'error' : 'info',
          event: 'http_request',
          requestId,
          method: request.method,
          path: request.route?.path ?? request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
        })}\n`,
      );
    });

    next();
  });
}
