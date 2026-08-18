import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export type WebAuthnCeremonyPurpose = 'register' | 'login';

export interface WebAuthnChallengeRecord {
  challenge: string;
  purpose: WebAuthnCeremonyPurpose;
  userId: string | null;
  emailAttempted: string | null;
  expiresAt: Date;
}

export interface IssueWebAuthnChallengeInput {
  ceremonyId: string;
  challenge: string;
  purpose: WebAuthnCeremonyPurpose;
  userId?: string | null;
  emailAttempted?: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export const WEBAUTHN_CHALLENGE_STORE = 'WEBAUTHN_CHALLENGE_STORE';

export function hashWebAuthnCeremonyId(ceremonyId: string): string {
  return createHash('sha256').update(ceremonyId).digest('hex');
}

export interface WebAuthnChallengeStore {
  issue(input: IssueWebAuthnChallengeInput): Promise<void>;
  deleteExpired(before: Date): Promise<number>;
  consume(
    ceremonyId: string,
    purpose: WebAuthnCeremonyPurpose,
    at: Date,
  ): Promise<WebAuthnChallengeRecord | null>;
}

export class InMemoryWebAuthnChallengeStore implements WebAuthnChallengeStore {
  private readonly rows = new Map<
    string,
    WebAuthnChallengeRecord & { consumedAt: Date | null }
  >();

  async issue(input: IssueWebAuthnChallengeInput): Promise<void> {
    this.rows.set(hashWebAuthnCeremonyId(input.ceremonyId), {
      challenge: input.challenge,
      purpose: input.purpose,
      userId: input.userId ?? null,
      emailAttempted: input.emailAttempted ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }

  async deleteExpired(before: Date): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt.getTime() < before.getTime()) {
        this.rows.delete(id);
        count += 1;
      }
    }
    return count;
  }

  async consume(
    ceremonyId: string,
    purpose: WebAuthnCeremonyPurpose,
    at: Date,
  ): Promise<WebAuthnChallengeRecord | null> {
    const row = this.rows.get(hashWebAuthnCeremonyId(ceremonyId));
    if (
      !row ||
      row.purpose !== purpose ||
      row.consumedAt !== null ||
      row.expiresAt.getTime() <= at.getTime()
    ) {
      return null;
    }
    row.consumedAt = at;
    return {
      challenge: row.challenge,
      purpose: row.purpose,
      userId: row.userId,
      emailAttempted: row.emailAttempted,
      expiresAt: row.expiresAt,
    };
  }
}

export class PostgresWebAuthnChallengeStore implements WebAuthnChallengeStore {
  constructor(private readonly pg: Pool) {}

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.pg.query(
      'DELETE FROM webauthn_challenges WHERE expires_at < $1',
      [before],
    );
    return result.rowCount ?? 0;
  }

  async issue(input: IssueWebAuthnChallengeInput): Promise<void> {
    await this.pg.query(
      `INSERT INTO webauthn_challenges
         (token_hash, challenge, purpose, user_id, email_attempted, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        hashWebAuthnCeremonyId(input.ceremonyId),
        input.challenge,
        input.purpose,
        input.userId ?? null,
        input.emailAttempted ?? null,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }

  async consume(
    ceremonyId: string,
    purpose: WebAuthnCeremonyPurpose,
    at: Date,
  ): Promise<WebAuthnChallengeRecord | null> {
    const { rows } = await this.pg.query<{
      challenge: string;
      purpose: WebAuthnCeremonyPurpose;
      user_id: string | null;
      email_attempted: string | null;
      expires_at: Date;
    }>(
      `UPDATE webauthn_challenges
          SET consumed_at = $3
        WHERE token_hash = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND expires_at > $3
        RETURNING challenge, purpose, user_id, email_attempted, expires_at`,
      [hashWebAuthnCeremonyId(ceremonyId), purpose, at],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      challenge: row.challenge,
      purpose: row.purpose,
      userId: row.user_id,
      emailAttempted: row.email_attempted,
      expiresAt: row.expires_at,
    };
  }
}
