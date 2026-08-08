import type { Pool } from 'pg';

import type { ConsentEvent, ConsentStore } from '../../ports/privacy';
import { withUserScope } from '../postgres/pool';

export class InMemoryConsentStore implements ConsentStore {
  private readonly rows: ConsentEvent[] = [];

  async list(userId: string): Promise<ConsentEvent[]> {
    return this.rows
      .filter((row) => row.userId === userId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
      )
      .map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
  }

  async record(userId: string, event: ConsentEvent): Promise<ConsentEvent> {
    if (event.userId !== userId) throw new Error('Consent owner does not match scope.');
    const stored = { ...event, createdAt: new Date(event.createdAt) };
    this.rows.push(stored);
    return { ...stored, createdAt: new Date(stored.createdAt) };
  }

  purgeUser(userId: string): void {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index]?.userId === userId) this.rows.splice(index, 1);
    }
  }
}

interface ConsentRow {
  id: string;
  user_id: string;
  kind: ConsentEvent['kind'];
  granted: boolean;
  policy_version: string;
  source: ConsentEvent['source'];
  created_at: Date;
}

function toConsent(row: ConsentRow): ConsentEvent {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    granted: row.granted,
    policyVersion: row.policy_version,
    source: row.source,
    createdAt: row.created_at,
  };
}

export class PostgresConsentStore implements ConsentStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<ConsentEvent[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<ConsentRow>(
        `SELECT id,user_id,kind,granted,policy_version,source,created_at
         FROM consent_events WHERE user_id = $1
         ORDER BY created_at DESC, id DESC`,
        [userId],
      );
      return rows.map(toConsent);
    });
  }

  async record(userId: string, event: ConsentEvent): Promise<ConsentEvent> {
    if (event.userId !== userId) throw new Error('Consent owner does not match scope.');
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<ConsentRow>(
        `INSERT INTO consent_events
           (id,user_id,kind,granted,policy_version,source,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,user_id,kind,granted,policy_version,source,created_at`,
        [
          event.id,
          userId,
          event.kind,
          event.granted,
          event.policyVersion,
          event.source,
          event.createdAt,
        ],
      );
      return toConsent(rows[0]!);
    });
  }
}
