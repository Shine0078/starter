/**
 * In-memory identity stores.
 *
 * Same role as the financial in-memory stores: they define the contract the
 * Postgres versions must satisfy, and they let the API run with no database.
 * They are exercised by the same contract suite, so a divergence fails a test.
 */

import type { AuthEvent, Session, User } from '../../domain/auth/types';
import {
  DuplicateEmailError,
  type AuthEventStore,
  type CreateUserInput,
  type SessionStore,
  type UserStore,
} from '../../ports/auth';

export class InMemoryUserStore implements UserStore {
  private readonly byId = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.byId.values()) {
      if (user.email === email && user.deletedAt === null) return { ...user };
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    const user = this.byId.get(id);
    return user && user.deletedAt === null ? { ...user } : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    if (await this.findByEmail(input.email)) throw new DuplicateEmailError();

    const user: User = {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      emailVerifiedAt: null,
      status: 'active',
      createdAt: new Date(),
      deletedAt: null,
    };

    this.byId.set(user.id, user);
    return { ...user };
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(userId);
    if (user) this.byId.set(userId, { ...user, passwordHash });
  }

  async setStatus(userId: string, status: User['status']): Promise<void> {
    const user = this.byId.get(userId);
    if (user) this.byId.set(userId, { ...user, status });
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    const user = this.byId.get(userId);
    if (user) this.byId.set(userId, { ...user, emailVerifiedAt: at });
  }

  purgeUser(userId: string): void {
    this.byId.delete(userId);
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, Session>();

  async create(session: Session): Promise<Session> {
    this.byId.set(session.id, { ...session });
    return { ...session };
  }

  async rotate(sessionId: string, successor: Session, at: Date): Promise<boolean> {
    const current = this.byId.get(sessionId);
    if (!current || current.revokedAt !== null) return false;

    this.byId.set(sessionId, {
      ...current,
      revokedAt: at,
      revokedReason: 'rotated',
    });
    this.byId.set(successor.id, { ...successor });
    return true;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    for (const session of this.byId.values()) {
      if (session.tokenHash === tokenHash) return { ...session };
    }
    return null;
  }

  async findById(userId: string, sessionId: string): Promise<Session | null> {
    const session = this.byId.get(sessionId);
    return session && session.userId === userId ? { ...session } : null;
  }

  async listActive(userId: string): Promise<Session[]> {
    const now = Date.now();
    return [...this.byId.values()]
      .filter(
        (s) => s.userId === userId && s.revokedAt === null && s.expiresAt.getTime() > now,
      )
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .map((s) => ({ ...s }));
  }

  async revoke(sessionId: string, reason: Session['revokedReason'], at: Date): Promise<void> {
    const session = this.byId.get(sessionId);
    // Never re-stamp an already revoked row: the first reason is the true one,
    // and overwriting 'rotated' would destroy the reuse-detection signal.
    if (session && session.revokedAt === null) {
      this.byId.set(sessionId, { ...session, revokedAt: at, revokedReason: reason });
    }
  }

  async revokeFamily(
    familyId: string,
    reason: Session['revokedReason'],
    at: Date,
  ): Promise<number> {
    let count = 0;
    for (const session of [...this.byId.values()]) {
      if (session.familyId === familyId && session.revokedAt === null) {
        this.byId.set(session.id, { ...session, revokedAt: at, revokedReason: reason });
        count += 1;
      }
    }
    return count;
  }

  async revokeAllForUser(
    userId: string,
    reason: Session['revokedReason'],
    at: Date,
  ): Promise<number> {
    let count = 0;
    for (const session of [...this.byId.values()]) {
      if (session.userId === userId && session.revokedAt === null) {
        this.byId.set(session.id, { ...session, revokedAt: at, revokedReason: reason });
        count += 1;
      }
    }
    return count;
  }

  async touch(sessionId: string, at: Date): Promise<void> {
    const session = this.byId.get(sessionId);
    if (session) this.byId.set(sessionId, { ...session, lastUsedAt: at });
  }

  async deleteExpired(before: Date): Promise<number> {
    let count = 0;
    for (const session of [...this.byId.values()]) {
      if (session.expiresAt.getTime() < before.getTime()) {
        this.byId.delete(session.id);
        count += 1;
      }
    }
    return count;
  }

  purgeUser(userId: string): void {
    for (const [id, session] of this.byId) {
      if (session.userId === userId) this.byId.delete(id);
    }
  }
}

export class InMemoryAuthEventStore implements AuthEventStore {
  private events: AuthEvent[] = [];

  async record(event: AuthEvent): Promise<void> {
    this.events.push({ ...event });
  }

  async recentFailures(email: string, since: Date): Promise<Date[]> {
    return this.events
      .filter(
        (e) =>
          e.succeeded === false &&
          e.kind === 'login' &&
          e.emailAttempted === email &&
          e.createdAt.getTime() >= since.getTime(),
      )
      .map((e) => e.createdAt);
  }

  async listForUser(userId: string, limit: number): Promise<AuthEvent[]> {
    return this.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  purgeUser(userId: string, email: string): void {
    this.events = this.events.filter(
      (event) => event.userId !== userId && event.emailAttempted !== email,
    );
  }
}
