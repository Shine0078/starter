import { timingSafeEqual } from 'node:crypto';

export interface HttpMetricSample {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

interface Counter {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  durationMs: number;
}

/**
 * Small provider-neutral metrics registry. It deliberately records route
 * templates (or `unmatched`) rather than raw URLs, so a user id, merchant, or
 * query string can never become a metric label. A Prometheus-compatible scrape
 * adapter can replace this later without changing request middleware.
 */
export class HttpMetrics {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<string, Counter>();

  record(sample: HttpMetricSample): void {
    const method = sample.method.toUpperCase();
    const route = sample.route.startsWith('/') ? sample.route : 'unmatched';
    const statusCode = Number.isInteger(sample.statusCode) ? sample.statusCode : 0;
    const durationMs = Number.isFinite(sample.durationMs) && sample.durationMs >= 0
      ? sample.durationMs
      : 0;
    const key = `${method}\u0000${route}\u0000${statusCode}`;
    const current = this.counters.get(key);
    if (current) {
      current.count += 1;
      current.durationMs += durationMs;
      return;
    }
    this.counters.set(key, {
      method,
      route,
      statusCode,
      count: 1,
      durationMs,
    });
  }

  snapshot(): ReadonlyArray<Readonly<Counter>> {
    return [...this.counters.values()].map((counter) => ({ ...counter }));
  }

  toPrometheus(now = Date.now()): string {
    const lines = [
      '# HELP finverse_process_uptime_seconds Process uptime in seconds.',
      '# TYPE finverse_process_uptime_seconds gauge',
      `finverse_process_uptime_seconds ${Math.max(0, now - this.startedAt) / 1_000}`,
      '# HELP finverse_http_requests_total Completed HTTP requests by route and status.',
      '# TYPE finverse_http_requests_total counter',
      '# HELP finverse_http_request_duration_seconds_sum Total request duration by route and status.',
      '# TYPE finverse_http_request_duration_seconds_sum counter',
      '# HELP finverse_http_request_duration_seconds_count Number of recorded request durations.',
      '# TYPE finverse_http_request_duration_seconds_count counter',
    ];

    for (const counter of this.counters.values()) {
      const labels = `{method="${escapeLabel(counter.method)}",route="${escapeLabel(counter.route)}",status_code="${counter.statusCode}"}`;
      lines.push(
        `finverse_http_requests_total${labels} ${counter.count}`,
        `finverse_http_request_duration_seconds_sum${labels} ${counter.durationMs / 1_000}`,
        `finverse_http_request_duration_seconds_count${labels} ${counter.count}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}

export const httpMetrics = new HttpMetrics();

export function metricsTokenMatches(
  authorization: string | undefined,
  expected: string,
): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}
