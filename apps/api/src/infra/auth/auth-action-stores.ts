import { randomUUID } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import type { Pool } from 'pg';

import type { AuthActionKind, AuthActionTokenStore, EmailSender } from '../../ports/auth';

interface ActionRow {
  userId: string;
  kind: AuthActionKind;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export class InMemoryAuthActionTokenStore implements AuthActionTokenStore {
  private readonly rows: ActionRow[] = [];

  async issue(
    userId: string,
    kind: AuthActionKind,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.kind === kind && row.usedAt === null) {
        row.usedAt = new Date();
      }
    }
    this.rows.push({ userId, kind, tokenHash, expiresAt, usedAt: null });
  }

  async consume(kind: AuthActionKind, tokenHash: string, at: Date): Promise<string | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.tokenHash === tokenHash &&
        candidate.usedAt === null &&
        candidate.expiresAt.getTime() > at.getTime(),
    );
    if (!row) return null;
    row.usedAt = at;
    return row.userId;
  }
}

export class PostgresAuthActionTokenStore implements AuthActionTokenStore {
  constructor(private readonly pg: Pool) {}

  async issue(
    userId: string,
    kind: AuthActionKind,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const client = await this.pg.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE auth_action_tokens SET used_at = now()
         WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`,
        [userId, kind],
      );
      await client.query(
        `INSERT INTO auth_action_tokens (id, user_id, kind, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), userId, kind, tokenHash, expiresAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async consume(kind: AuthActionKind, tokenHash: string, at: Date): Promise<string | null> {
    const { rows } = await this.pg.query<{ user_id: string }>(
      `UPDATE auth_action_tokens SET used_at = $3
       WHERE kind = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > $3
       RETURNING user_id`,
      [kind, tokenHash, at],
    );
    return rows[0]?.user_id ?? null;
  }
}

export interface DevelopmentEmail {
  email: string;
  kind: AuthActionKind;
  token: string;
}

/** Development/test delivery. Production startup rejects this adapter. */
export class DevelopmentEmailSender implements EmailSender {
  private readonly messages: DevelopmentEmail[] = [];

  async sendAction(email: string, kind: AuthActionKind, token: string): Promise<void> {
    this.messages.push({ email, kind, token });
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.log(`[development email] ${kind} for ${email}: ${token}`);
    }
  }

  async sendSecurityNotice(email: string, subject: string, _body: string): Promise<void> {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.log(`[development email] ${subject} for ${email}`);
    }
  }

  latest(email: string, kind: AuthActionKind): DevelopmentEmail | null {
    return [...this.messages].reverse().find((message) => message.email === email && message.kind === kind) ?? null;
  }
}

export interface SmtpEmailOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpEmailOptions) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.password },
    });
  }

  async sendAction(email: string, kind: AuthActionKind, token: string): Promise<void> {
    const verification = kind === 'verify_email';
    const purpose = verification ? 'verify your email' : 'reset your password';
    const lifetime = verification ? '24 hours' : '1 hour';
    await this.transporter.sendMail({
      from: this.options.from,
      to: email,
      subject: verification ? 'Verify your FINVERSE email' : 'Reset your FINVERSE password',
      text:
        `Use this one-time code to ${purpose}:\n\n${token}\n\n` +
        `It expires in ${lifetime}. If you did not request this, you can ignore this message.`,
    });
  }

  async sendSecurityNotice(email: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.from,
      to: email,
      subject,
      text: body,
    });
  }
}
