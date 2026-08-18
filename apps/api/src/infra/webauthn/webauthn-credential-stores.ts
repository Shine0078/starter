import type { Pool } from 'pg';

import type { WebAuthnCredential, WebAuthnCredentialStore } from '../../ports/webauthn';
import { withUserScope } from '../postgres/pool';

export class InMemoryWebAuthnCredentialStore implements WebAuthnCredentialStore {
  private readonly byUser = new Map<string, WebAuthnCredential[]>();

  private bucket(userId: string): WebAuthnCredential[] {
    const existing = this.byUser.get(userId);
    if (existing) return existing;
    const fresh: WebAuthnCredential[] = [];
    this.byUser.set(userId, fresh);
    return fresh;
  }

  async register(userId: string, credential: WebAuthnCredential, createdAt: string): Promise<void> {
    this.bucket(userId).push({ ...credential, createdAt });
  }

  async list(userId: string): Promise<WebAuthnCredential[]> {
    return [...this.bucket(userId)];
  }

  async get(userId: string, credentialId: string): Promise<WebAuthnCredential | null> {
    return this.bucket(userId).find((row) => row.credentialId === credentialId) ?? null;
  }

  async findByCredentialId(
    credentialId: string,
  ): Promise<{ userId: string; credential: WebAuthnCredential } | null> {
    for (const [userId, rows] of this.byUser) {
      const credential = rows.find((row) => row.credentialId === credentialId);
      if (credential) return { userId, credential };
    }
    return null;
  }

  async updateCounter(userId: string, credentialId: string, counter: number): Promise<void> {
    const rows = this.bucket(userId);
    const index = rows.findIndex((row) => row.credentialId === credentialId);
    const current = index >= 0 ? rows[index] : undefined;
    if (!current) throw new Error('WebAuthn sign counter could not be advanced.');
    if (!(current.counter < counter || (current.counter === 0 && counter === 0))) {
      throw new Error('WebAuthn sign counter could not be advanced.');
    }
    rows[index] = {
      ...current,
      counter: current.counter === 0 && counter === 0 ? current.counter : counter,
      lastUsedAt: new Date().toISOString(),
    };
  }

  async remove(userId: string, credentialId: string): Promise<boolean> {
    const rows = this.bucket(userId);
    const index = rows.findIndex((row) => row.credentialId === credentialId);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  }

  async purgeUser(userId: string): Promise<void> {
    this.byUser.delete(userId);
  }
}

interface CredentialRow {
  user_id: string;
  credential_id: string;
  public_key_pem: string;
  counter: number;
  created_at: Date;
  last_used_at: Date | null;
}

const COLUMNS = 'user_id, credential_id, public_key_pem, counter, created_at, last_used_at';

function toCredential(row: CredentialRow): WebAuthnCredential {
  return {
    credentialId: row.credential_id,
    publicKeyPem: row.public_key_pem,
    counter: row.counter,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

export class PostgresWebAuthnCredentialStore implements WebAuthnCredentialStore {
  constructor(private readonly pg: Pool) {}

  async register(userId: string, credential: WebAuthnCredential, createdAt: string): Promise<void> {
    await withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `INSERT INTO webauthn_credentials
           (user_id, credential_id, public_key_pem, counter, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, credential.credentialId, credential.publicKeyPem, credential.counter, createdAt],
      );
    });
  }

  async list(userId: string): Promise<WebAuthnCredential[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<CredentialRow>(
        `SELECT ${COLUMNS} FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
      return rows.map(toCredential);
    });
  }

  async get(userId: string, credentialId: string): Promise<WebAuthnCredential | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<CredentialRow>(
        `SELECT ${COLUMNS} FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2`,
        [userId, credentialId],
      );
      return rows[0] ? toCredential(rows[0]) : null;
    });
  }

  async findByCredentialId(
    credentialId: string,
  ): Promise<{ userId: string; credential: WebAuthnCredential } | null> {
    const { rows } = await this.pg.query<{ user_id: string }>(
      'SELECT user_id FROM finverse_webauthn_credential_owner($1)',
      [credentialId],
    );
    const userId = rows[0]?.user_id;
    if (!userId) return null;
    const credential = await this.get(userId, credentialId);
    if (!credential) return null;
    return { userId, credential };
  }

  async updateCounter(userId: string, credentialId: string, counter: number): Promise<void> {
    const updated = await withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        `UPDATE webauthn_credentials
            SET counter = CASE
                  WHEN counter = 0 AND $3 = 0 THEN counter
                  ELSE $3
                END,
                last_used_at = now()
          WHERE user_id = $1
            AND credential_id = $2
            AND (counter < $3 OR (counter = 0 AND $3 = 0))`,
        [userId, credentialId, counter],
      );
      return (result.rowCount ?? 0) === 1;
    });
    if (!updated) {
      throw new Error('WebAuthn sign counter could not be advanced.');
    }
  }

  async remove(userId: string, credentialId: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
        [userId, credentialId],
      );
      return (result.rowCount ?? 0) === 1;
    });
  }

  async purgeUser(userId: string): Promise<void> {
    await withUserScope(this.pg, userId, async (client) => {
      await client.query('DELETE FROM webauthn_credentials WHERE user_id = $1', [userId]);
    });
  }
}
