import { describe, expect, it } from 'vitest';

import { HttpMetrics, metricsTokenMatches } from '../src/infra/http/metrics';

describe('HttpMetrics', () => {
  it('aggregates route-template counters and durations', () => {
    const metrics = new HttpMetrics();
    metrics.record({ method: 'get', route: '/api/accounts', statusCode: 200, durationMs: 12.5 });
    metrics.record({ method: 'GET', route: '/api/accounts', statusCode: 200, durationMs: 7.5 });
    metrics.record({ method: 'POST', route: '/api/accounts', statusCode: 401, durationMs: 4 });

    expect(metrics.snapshot()).toEqual([
      {
        method: 'GET',
        route: '/api/accounts',
        statusCode: 200,
        count: 2,
        durationMs: 20,
      },
      {
        method: 'POST',
        route: '/api/accounts',
        statusCode: 401,
        count: 1,
        durationMs: 4,
      },
    ]);
    expect(metrics.toPrometheus(Date.now() + 1_500)).toContain(
      'finverse_http_requests_total{method="GET",route="/api/accounts",status_code="200"} 2',
    );
  });

  it('never turns an unmatched URL into a high-cardinality metric label', () => {
    const metrics = new HttpMetrics();
    metrics.record({
      method: 'GET',
      route: 'unmatched',
      statusCode: 404,
      durationMs: 1,
    });
    expect(metrics.toPrometheus()).toContain('route="unmatched"');
    expect(metrics.toPrometheus()).not.toContain('merchant');
  });

  it('requires an exact bearer token', () => {
    const token = 'metrics-token-that-is-long-enough';
    expect(metricsTokenMatches(`Bearer ${token}`, token)).toBe(true);
    expect(metricsTokenMatches(`Bearer ${token}x`, token)).toBe(false);
    expect(metricsTokenMatches(token, token)).toBe(false);
  });
});
