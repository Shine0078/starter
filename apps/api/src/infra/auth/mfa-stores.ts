import type { Pool } from 'pg';

import type { MfaLoginChallenge, MfaRecord, MfaStore } from '../../ports/auth';
import { withTransaction } from '../postgres/pool';

interface RecoveryRow { hash: string; usedAt: Date | null }
interface ChallengeRow extends MfaLoginChallenge { usedAt: Date | null; failedAttempts: number }

export class InMemoryMfaStore implements MfaStore {
  private readonly records = new Map<string, MfaRecord>();
  private readonly recovery = new Map<string, RecoveryRow[]>();
  private readonly challenges = new Map<string, ChallengeRow>();

  async get(userId: string): Promise<MfaRecord | null> {
    const row = this.records.get(userId);
    return row ? { ...row } : null;
  }

  async savePending(userId: string, encryptedSecret: string, _at: Date): Promise<void> {
    this.records.set(userId, { userId, encryptedSecret, enabledAt: null, lastUsedStep: null });
    this.recovery.delete(userId);
  }

  async enable(userId: string, recoveryCodeHashes: string[], at: Date): Promise<boolean> {
    const row = this.records.get(userId);
    if (!row || row.enabledAt !== null) return false;
    row.enabledAt = at;
    this.recovery.set(userId, recoveryCodeHashes.map((hash) => ({ hash, usedAt: null })));
    return true;
  }

  async disable(userId: string): Promise<void> {
    this.records.delete(userId);
    this.recovery.delete(userId);
    for (const [hash, challenge] of this.challenges) {
      if (challenge.userId === userId) this.challenges.delete(hash);
    }
  }

  async acceptTotpStep(userId: string, step: number): Promise<boolean> {
    const row = this.records.get(userId);
    if (!row || row.enabledAt === null || (row.lastUsedStep !== null && row.lastUsedStep >= step)) return false;
    row.lastUsedStep = step;
    return true;
  }

  async consumeRecoveryCode(userId: string, codeHash: string, at: Date): Promise<boolean> {
    const row = this.recovery.get(userId)?.find((candidate) => candidate.hash === codeHash && candidate.usedAt === null);
    if (!row) return false;
    row.usedAt = at;
    return true;
  }

  async recoveryCodesRemaining(userId: string): Promise<number> {
    return this.recovery.get(userId)?.filter((row) => row.usedAt === null).length ?? 0;
  }

  async createChallenge(tokenHash: string, userId: string, expiresAt: Date, _at: Date): Promise<void> {
    this.challenges.set(tokenHash, { userId, expiresAt, usedAt: null, failedAttempts: 0 });
  }

  async findChallenge(tokenHash: string, at: Date): Promise<MfaLoginChallenge | null> {
    const row = this.challenges.get(tokenHash);
    return row && row.usedAt === null && row.expiresAt.getTime() > at.getTime()
      ? { userId: row.userId, expiresAt: row.expiresAt }
      : null;
  }

  async consumeChallenge(tokenHash: string, at: Date): Promise<boolean> {
    const row = this.challenges.get(tokenHash);
    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= at.getTime()) return false;
    row.usedAt = at;
    return true;
  }

  async failChallenge(tokenHash: string, at: Date): Promise<number | null> {
    const row = this.challenges.get(tokenHash);
    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= at.getTime()) return null;
    row.failedAttempts += 1;
    if (row.failedAttempts >= 5) row.usedAt = at;
    return Math.max(0, 5 - row.failedAttempts);
  }

  purgeUser(userId: string): void {
    this.records.delete(userId);
    this.recovery.delete(userId);
    for (const [hash, row] of this.challenges) if (row.userId === userId) this.challenges.delete(hash);
  }
}

export class PostgresMfaStore implements MfaStore {
  constructor(private readonly pg: Pool) {}

  async get(userId: string): Promise<MfaRecord | null> {
    const { rows } = await this.pg.query<{
      user_id: string; encrypted_secret: string; enabled_at: Date | null; last_used_step: string | null;
    }>('SELECT user_id, encrypted_secret, enabled_at, last_used_step FROM user_mfa WHERE user_id = $1', [userId]);
    const row = rows[0];
    return row ? { userId: row.user_id, encryptedSecret: row.encrypted_secret, enabledAt: row.enabled_at, lastUsedStep: row.last_used_step === null ? null : Number(row.last_used_step) } : null;
  }

  async savePending(userId: string, encryptedSecret: string, at: Date): Promise<void> {
    await withTransaction(this.pg, async (client) => {
      await client.query(
        `INSERT INTO user_mfa (user_id, encrypted_secret, enabled_at, last_used_step, created_at, updated_at)
         VALUES ($1,$2,NULL,NULL,$3,$3)
         ON CONFLICT (user_id) DO UPDATE SET encrypted_secret=$2, enabled_at=NULL, last_used_step=NULL, updated_at=$3`,
        [userId, encryptedSecret, at],
      );
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1', [userId]);
    });
  }

  async enable(userId: string, recoveryCodeHashes: string[], at: Date): Promise<boolean> {
    return withTransaction(this.pg, async (client) => {
      const result = await client.query(
        'UPDATE user_mfa SET enabled_at=$2, updated_at=$2 WHERE user_id=$1 AND enabled_at IS NULL',
        [userId, at],
      );
      if (result.rowCount !== 1) return false;
      for (const hash of recoveryCodeHashes) {
        await client.query('INSERT INTO mfa_recovery_codes (user_id, code_hash, created_at) VALUES ($1,$2,$3)', [userId, hash, at]);
      }
      return true;
    });
  }

  async disable(userId: string): Promise<void> {
    await this.pg.query('DELETE FROM user_mfa WHERE user_id=$1', [userId]);
  }

  async acceptTotpStep(userId: string, step: number): Promise<boolean> {
    const result = await this.pg.query(
      `UPDATE user_mfa SET last_used_step=$2, updated_at=now()
       WHERE user_id=$1 AND enabled_at IS NOT NULL AND (last_used_step IS NULL OR last_used_step < $2)`,
      [userId, step],
    );
    return result.rowCount === 1;
  }

  async consumeRecoveryCode(userId: string, codeHash: string, at: Date): Promise<boolean> {
    const result = await this.pg.query(
      'UPDATE mfa_recovery_codes SET used_at=$3 WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL',
      [userId, codeHash, at],
    );
    return result.rowCount === 1;
  }

  async recoveryCodesRemaining(userId: string): Promise<number> {
    const { rows } = await this.pg.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL', [userId],
    );
    return rows[0]?.count ?? 0;
  }

  async createChallenge(tokenHash: string, userId: string, expiresAt: Date, at: Date): Promise<void> {
    await this.pg.query(
      'INSERT INTO mfa_login_challenges (token_hash,user_id,expires_at,created_at) VALUES ($1,$2,$3,$4)',
      [tokenHash, userId, expiresAt, at],
    );
  }

  async findChallenge(tokenHash: string, at: Date): Promise<MfaLoginChallenge | null> {
    const { rows } = await this.pg.query<{ user_id: string; expires_at: Date }>(
      'SELECT user_id,expires_at FROM mfa_login_challenges WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2',
      [tokenHash, at],
    );
    return rows[0] ? { userId: rows[0].user_id, expiresAt: rows[0].expires_at } : null;
  }

  async consumeChallenge(tokenHash: string, at: Date): Promise<boolean> {
    const result = await this.pg.query(
      'UPDATE mfa_login_challenges SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2',
      [tokenHash, at],
    );
    return result.rowCount === 1;
  }

  async failChallenge(tokenHash: string, at: Date): Promise<number | null> {
    const { rows } = await this.pg.query<{ failed_attempts: number }>(
      `UPDATE mfa_login_challenges
       SET failed_attempts=failed_attempts+1,
           used_at=CASE WHEN failed_attempts+1 >= 5 THEN $2 ELSE used_at END
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2
       RETURNING failed_attempts`,
      [tokenHash, at],
    );
    return rows[0] ? Math.max(0, 5 - rows[0].failed_attempts) : null;
  }

  purgeUser(_userId: string): void {
    // PostgreSQL erasure is provided by ON DELETE CASCADE from users.
  }
}
