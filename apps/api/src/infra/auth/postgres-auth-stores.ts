/**
 * Postgres identity stores.
 *
 * Every statement is parameterised — there is no string interpolation of user
 * input anywhere in this file, and there must never be. An injection here is
 * an authentication bypass, not just a data leak.
 */

import type { Pool } from 'pg';

import type { AuthEvent, Session, User } from '../../domain/auth/types';
import {
  DuplicateEmailError,
  type AuthEventStore,
  type CreateUserInput,
  type SessionStore,
  type UserStore,
} from '../../ports/auth';

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string | null;
  email_verified_at: Date | null;
  status: string;
  created_at: Date;
  deleted_at: Date | null;
}

const USER_COLUMNS = `
  id, email, password_hash, display_name, email_verified_at, status, created_at, deleted_at
`;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email ?? '',
    passwordHash: row.password_hash ?? '',
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at,
    status: row.status as User['status'],
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

export class PostgresUserStore implements UserStore {
  constructor(private readonly pg: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pg.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
       WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pg.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const { rows } = await this.pg.query<UserRow>(
        `INSERT INTO users (id, email, password_hash, display_name, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING ${USER_COLUMNS}`,
        [input.id, input.email, input.passwordHash, input.displayName],
      );
      return toUser(rows[0]!);
    } catch (error) {
      // The unique index is the arbiter, not a prior SELECT. Two simultaneous
      // registrations for the same address both pass a read-then-write check;
      // only one can pass this.
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new DuplicateEmailError();
        }
      }
      throw error;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pg.query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
      [userId, passwordHash],
    );
  }

  async setStatus(userId: string, status: User['status']): Promise<void> {
    await this.pg.query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [
      userId,
      status,
    ]);
  }
}

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  issued_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  user_agent: string | null;
  ip_address: string | null;
}

const SESSION_COLUMNS = `
  id, user_id, family_id, token_hash, issued_at, expires_at,
  last_used_at, revoked_at, revoked_reason, user_agent, ip_address
`;

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    tokenHash: row.token_hash,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason as Session['revokedReason'],
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
  };
}

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pg: Pool) {}

  async create(session: Session): Promise<Session> {
    const { rows } = await this.pg.query<SessionRow>(
      `INSERT INTO sessions
         (id, user_id, family_id, token_hash, issued_at, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SESSION_COLUMNS}`,
      [
        session.id,
        session.userId,
        session.familyId,
        session.tokenHash,
        session.issuedAt,
        session.expiresAt,
        session.userAgent,
        session.ipAddress,
      ],
    );
    return toSession(rows[0]!);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const { rows } = await this.pg.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async findById(userId: string, sessionId: string): Promise<Session | null> {
    const { rows } = await this.pg.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE user_id = $1 AND id = $2`,
      [userId, sessionId],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async listActive(userId: string): Promise<Session[]> {
    const { rows } = await this.pg.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY issued_at DESC`,
      [userId],
    );
    return rows.map(toSession);
  }

  async revoke(sessionId: string, reason: Session['revokedReason'], at: Date): Promise<void> {
    // `revoked_at IS NULL` keeps the original reason. Overwriting 'rotated'
    // would erase the signal that reuse detection depends on.
    await this.pg.query(
      `UPDATE sessions SET revoked_at = $3, revoked_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, reason, at],
    );
  }

  async revokeFamily(
    familyId: string,
    reason: Session['revokedReason'],
    at: Date,
  ): Promise<number> {
    const result = await this.pg.query(
      `UPDATE sessions SET revoked_at = $3, revoked_reason = $2
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId, reason, at],
    );
    return result.rowCount ?? 0;
  }

  async revokeAllForUser(
    userId: string,
    reason: Session['revokedReason'],
    at: Date,
  ): Promise<number> {
    const result = await this.pg.query(
      `UPDATE sessions SET revoked_at = $3, revoked_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason, at],
    );
    return result.rowCount ?? 0;
  }

  async touch(sessionId: string, at: Date): Promise<void> {
    await this.pg.query('UPDATE sessions SET last_used_at = $2 WHERE id = $1', [sessionId, at]);
  }

  async deleteExpired(before: Date): Promise<number> {
    const result = await this.pg.query('DELETE FROM sessions WHERE expires_at < $1', [before]);
    return result.rowCount ?? 0;
  }
}

interface AuthEventRow {
  id: string;
  user_id: string | null;
  email_attempted: string | null;
  kind: string;
  succeeded: boolean;
  ip_address: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: Date;
}

export class PostgresAuthEventStore implements AuthEventStore {
  constructor(private readonly pg: Pool) {}

  async record(event: AuthEvent): Promise<void> {
    await this.pg.query(
      `INSERT INTO auth_events
         (id, user_id, email_attempted, kind, succeeded, ip_address, user_agent, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        event.userId,
        event.emailAttempted,
        event.kind,
        event.succeeded,
        event.ipAddress,
        event.userAgent,
        event.detail,
        event.createdAt,
      ],
    );
  }

  async recentFailures(email: string, since: Date): Promise<Date[]> {
    const { rows } = await this.pg.query<{ created_at: Date }>(
      `SELECT created_at FROM auth_events
       WHERE succeeded = false
         AND lower(email_attempted) = lower($1)
         AND created_at >= $2
       ORDER BY created_at DESC`,
      [email, since],
    );
    return rows.map((r) => r.created_at);
  }

  async listForUser(userId: string, limit: number): Promise<AuthEvent[]> {
    const { rows } = await this.pg.query<AuthEventRow>(
      `SELECT id, user_id, email_attempted, kind, succeeded,
              ip_address, user_agent, detail, created_at
       FROM auth_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      emailAttempted: row.email_attempted,
      kind: row.kind as AuthEvent['kind'],
      succeeded: row.succeeded,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
