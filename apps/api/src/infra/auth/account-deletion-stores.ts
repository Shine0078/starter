import type { Pool } from 'pg';

import type { AccountDeletionStore } from '../../ports/auth';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryGoalStore,
  InMemoryNotificationStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../in-memory-store';
import { withTransaction } from '../postgres/pool';
import { InMemoryBankLinkStore, InMemoryBankWebhookStore } from '../banking/bank-link-stores';
import { InMemorySubscriptionStore } from '../billing/subscription-stores';
import { InMemoryConsentStore } from '../privacy/consent-stores';
import { InMemoryAuthEventStore, InMemorySessionStore, InMemoryUserStore } from './in-memory-auth-stores';
import { InMemoryMfaStore } from './mfa-stores';

interface PendingDeletion {
  email: string;
  purgeAfter: Date;
}

export class InMemoryAccountDeletionStore implements AccountDeletionStore {
  private readonly pending = new Map<string, PendingDeletion>();

  constructor(
    private readonly users: InMemoryUserStore,
    private readonly sessions: InMemorySessionStore,
    private readonly events: InMemoryAuthEventStore,
    private readonly accounts: InMemoryAccountStore,
    private readonly transactions: InMemoryTransactionStore,
    private readonly budgets: InMemoryBudgetStore,
    private readonly rules: InMemoryRuleStore,
    private readonly goals: InMemoryGoalStore,
    private readonly notifications: InMemoryNotificationStore,
    private readonly bankLinks: InMemoryBankLinkStore,
    private readonly bankWebhooks: InMemoryBankWebhookStore,
    private readonly consents: InMemoryConsentStore,
    private readonly mfa: InMemoryMfaStore,
    private readonly subscriptions: InMemorySubscriptionStore,
  ) {}

  async request(userId: string, email: string, _requestedAt: Date, purgeAfter: Date): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') throw new Error('Account is not active.');
    await this.users.setStatus(userId, 'pending_deletion');
    this.pending.set(userId, { email, purgeAfter });
  }

  async cancel(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'pending_deletion' || !this.pending.has(userId)) {
      throw new Error('Account deletion is not pending.');
    }
    this.pending.delete(userId);
    await this.users.setStatus(userId, 'active');
  }

  async purgeDue(asOf: Date): Promise<number> {
    let purged = 0;
    for (const [userId, deletion] of [...this.pending]) {
      if (deletion.purgeAfter.getTime() > asOf.getTime()) continue;
      this.accounts.purgeUser(userId);
      this.transactions.purgeUser(userId);
      this.budgets.purgeUser(userId);
      this.rules.purgeUser(userId);
      this.goals.purgeUser(userId);
      this.notifications.purgeUser(userId);
      this.bankLinks.purgeUser(userId);
      this.bankWebhooks.purgeUser(userId);
      this.consents.purgeUser(userId);
      this.mfa.purgeUser(userId);
      // The Postgres adapter gets this from the FK cascade on `users`; the
      // in-memory one has to be told, and a missed store here is how an
      // "erased" account keeps a row nobody looks at again.
      this.subscriptions.purgeUser(userId);
      this.sessions.purgeUser(userId);
      this.events.purgeUser(userId, deletion.email);
      this.users.purgeUser(userId);
      this.pending.delete(userId);
      purged += 1;
    }
    return purged;
  }
}

export class PostgresAccountDeletionStore implements AccountDeletionStore {
  constructor(private readonly pg: Pool) {}

  async request(userId: string, email: string, requestedAt: Date, purgeAfter: Date): Promise<void> {
    const result = await this.pg.query(
      `UPDATE users
       SET status = 'pending_deletion', deletion_requested_at = $3,
           purge_after = $4, updated_at = now()
       WHERE id = $1 AND lower(email) = lower($2) AND status = 'active'`,
      [userId, email, requestedAt, purgeAfter],
    );
    if (result.rowCount !== 1) throw new Error('Account is not active.');
  }

  async cancel(userId: string): Promise<void> {
    const result = await this.pg.query(
      `UPDATE users
       SET status = 'active', deletion_requested_at = NULL,
           purge_after = NULL, updated_at = now()
       WHERE id = $1 AND status = 'pending_deletion'`,
      [userId],
    );
    if (result.rowCount !== 1) throw new Error('Account deletion is not pending.');
  }

  async purgeDue(asOf: Date): Promise<number> {
    return withTransaction(this.pg, async (client) => {
      const { rows } = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM users
         WHERE status = 'pending_deletion' AND purge_after <= $1
         FOR UPDATE`,
        [asOf],
      );

      for (const user of rows) {
        // auth_events uses ON DELETE SET NULL for ordinary audit retention.
        // An account-erasure request is different: identity-linked events and
        // failed attempts bearing the user's email are personal data too.
        await client.query(
          'DELETE FROM auth_events WHERE user_id = $1 OR lower(email_attempted) = lower($2)',
          [user.id, user.email],
        );
        await client.query(
          `DELETE FROM users
           WHERE id = $1 AND status = 'pending_deletion' AND purge_after <= $2`,
          [user.id, asOf],
        );
      }
      return rows.length;
    });
  }
}
