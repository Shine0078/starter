import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Pool } from 'pg';

import { withTransaction } from '../postgres/pool';

interface BucketRow {
  total_hits: number;
  window_expires_at: Date;
  blocked_until: Date | null;
  database_now: Date;
}

/**
 * Fixed-window throttling shared by every API instance through PostgreSQL.
 *
 * Nest hashes the route, throttler name, and client tracker before calling the
 * storage adapter, so no IP address or user identifier is persisted here. A
 * row lock makes the increment atomic across processes and hosts.
 */
export class PostgresThrottlerStorage implements ThrottlerStorage {
  private operations = 0;

  constructor(private readonly pg: Pool) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    if (!key || !throttlerName) throw new Error('Rate-limit key and name are required.');
    if (![ttl, limit, blockDuration].every(Number.isFinite)) {
      throw new Error('Rate-limit parameters must be finite numbers.');
    }
    if (ttl <= 0 || limit <= 0 || blockDuration < 0) {
      throw new Error('Rate-limit ttl and limit must be positive; block duration cannot be negative.');
    }

    const record = await withTransaction(this.pg, async (client) => {
      await client.query(
        `INSERT INTO rate_limit_buckets
           (key_hash, throttler_name, total_hits, window_expires_at)
         VALUES ($1, $2, 0, clock_timestamp())
         ON CONFLICT (key_hash, throttler_name) DO NOTHING`,
        [key, throttlerName],
      );

      const { rows } = await client.query<BucketRow>(
        `SELECT total_hits, window_expires_at, blocked_until,
                clock_timestamp() AS database_now
           FROM rate_limit_buckets
          WHERE key_hash = $1 AND throttler_name = $2
          FOR UPDATE`,
        [key, throttlerName],
      );
      const bucket = rows[0]!;
      const now = bucket.database_now;

      if (bucket.blocked_until && bucket.blocked_until.getTime() > now.getTime()) {
        return {
          totalHits: bucket.total_hits,
          timeToExpire: secondsUntil(now, bucket.window_expires_at),
          isBlocked: true,
          timeToBlockExpire: secondsUntil(now, bucket.blocked_until),
        };
      }

      const blockExpired =
        bucket.blocked_until !== null && bucket.blocked_until.getTime() <= now.getTime();
      const windowExpired = bucket.window_expires_at.getTime() <= now.getTime();
      const reset = blockExpired || windowExpired;
      const totalHits = reset ? 1 : bucket.total_hits + 1;
      const windowExpiresAt = reset
        ? new Date(now.getTime() + ttl)
        : bucket.window_expires_at;
      const blockedUntil =
        totalHits > limit ? new Date(now.getTime() + blockDuration) : null;

      await client.query(
        `UPDATE rate_limit_buckets
            SET total_hits = $3,
                window_expires_at = $4,
                blocked_until = $5,
                updated_at = clock_timestamp()
          WHERE key_hash = $1 AND throttler_name = $2`,
        [key, throttlerName, totalHits, windowExpiresAt, blockedUntil],
      );

      return {
        totalHits,
        timeToExpire: secondsUntil(now, windowExpiresAt),
        isBlocked: blockedUntil !== null,
        timeToBlockExpire: blockedUntil ? secondsUntil(now, blockedUntil) : 0,
      };
    });

    // Opportunistic retention keeps one-off scanner IPs from growing the table
    // forever without putting a cleanup query on every request.
    this.operations += 1;
    if (this.operations % 1_000 === 0) {
      await this.pg.query(
        `DELETE FROM rate_limit_buckets
          WHERE window_expires_at < clock_timestamp() - interval '1 day'
            AND (blocked_until IS NULL OR blocked_until < clock_timestamp() - interval '1 day')`,
      );
    }

    return record;
  }
}

function secondsUntil(from: Date, until: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - from.getTime()) / 1_000));
}
