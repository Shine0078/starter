import type { Pool } from 'pg';

import type {
  PushPlatform,
  PushTokenStore,
  RegisteredPushToken,
} from '../../ports/push';
import { withUserScope } from '../postgres/pool';

export class InMemoryPushTokenStore implements PushTokenStore {
  private readonly byUser = new Map<string, Map<string, PushPlatform>>();

  private bucket(userId: string): Map<string, PushPlatform> {
    const existing = this.byUser.get(userId);
    if (existing) return existing;
    const fresh = new Map<string, PushPlatform>();
    this.byUser.set(userId, fresh);
    return fresh;
  }

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    this.bucket(userId).set(token, platform);
  }

  async list(userId: string): Promise<readonly RegisteredPushToken[]> {
    return [...this.bucket(userId)].map(([token, platform]) => ({ token, platform }));
  }

  async unregister(userId: string, token: string): Promise<boolean> {
    return this.bucket(userId).delete(token);
  }

  async purgeUser(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}

export class PostgresPushTokenStore implements PushTokenStore {
  constructor(private readonly pg: Pool) {}

  async register(userId: string, token: string, platform: PushPlatform, at: string): Promise<void> {
    await withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `INSERT INTO push_tokens (user_id, token, platform, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (user_id, token) DO UPDATE SET
           platform = EXCLUDED.platform,
           last_seen_at = EXCLUDED.last_seen_at`,
        [userId, token, platform, at],
      );
    });
  }

  async list(userId: string): Promise<readonly RegisteredPushToken[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<{ token: string; platform: PushPlatform }>(
        `SELECT token, platform FROM push_tokens
         WHERE user_id = $1
         ORDER BY last_seen_at DESC, token ASC`,
        [userId],
      );
      return rows;
    });
  }

  async unregister(userId: string, token: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM push_tokens WHERE user_id = $1 AND token = $2',
        [userId, token],
      );
      return (result.rowCount ?? 0) === 1;
    });
  }

  async purgeUser(userId: string): Promise<void> {
    await this.pg.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
  }
}
