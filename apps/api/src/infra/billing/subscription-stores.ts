import type { Pool } from 'pg';

import type { PlanId, SubscriptionStatus } from '../../domain/billing/plans';
import type { BillingEventStore, Subscription, SubscriptionStore } from '../../ports/billing';
import { withUserScope } from '../postgres/pool';

// ------------------------------------------------------------------ in-memory

export class InMemorySubscriptionStore implements SubscriptionStore {
  private readonly rows = new Map<string, Subscription>();

  async get(userId: string): Promise<Subscription | null> {
    return this.rows.get(userId) ?? null;
  }

  async upsert(subscription: Subscription): Promise<Subscription> {
    // Mirrors the unique constraint in 013_billing.sql. Without it the
    // in-memory adapter would accept a state the database refuses, and the
    // contract suite would pass while production failed.
    for (const [userId, row] of this.rows) {
      if (userId !== subscription.userId && row.providerCustomerId === subscription.providerCustomerId) {
        throw new Error('That billing customer already belongs to another account.');
      }
    }
    this.rows.set(subscription.userId, { ...subscription });
    return { ...subscription };
  }

  async findUserByCustomerId(providerCustomerId: string): Promise<string | null> {
    for (const [userId, row] of this.rows) {
      if (row.providerCustomerId === providerCustomerId) return userId;
    }
    return null;
  }

  purgeUser(userId: string): void {
    this.rows.delete(userId);
  }
}

export class InMemoryBillingEventStore implements BillingEventStore {
  private readonly seen = new Set<string>();

  async claim(eventId: string): Promise<boolean> {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    return true;
  }
}

// ------------------------------------------------------------------- postgres

interface SubscriptionRow {
  user_id: string;
  plan: PlanId;
  status: SubscriptionStatus;
  provider_customer_id: string;
  provider_subscription_id: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  trial_end: Date | null;
  updated_at: Date;
}

const COLUMNS = `user_id, plan, status, provider_customer_id, provider_subscription_id,
 current_period_end, cancel_at_period_end, trial_end, updated_at`;

const map = (row: SubscriptionRow): Subscription => ({
  userId: row.user_id,
  plan: row.plan,
  status: row.status,
  providerCustomerId: row.provider_customer_id,
  providerSubscriptionId: row.provider_subscription_id,
  currentPeriodEnd: row.current_period_end,
  cancelAtPeriodEnd: row.cancel_at_period_end,
  trialEnd: row.trial_end,
  updatedAt: row.updated_at,
});

export class PostgresSubscriptionStore implements SubscriptionStore {
  constructor(private readonly pg: Pool) {}

  async get(userId: string): Promise<Subscription | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SubscriptionRow>(
        `SELECT ${COLUMNS} FROM subscriptions WHERE user_id = $1`,
        [userId],
      );
      return rows[0] ? map(rows[0]) : null;
    });
  }

  async upsert(subscription: Subscription): Promise<Subscription> {
    return withUserScope(this.pg, subscription.userId, async (client) => {
      const { rows } = await client.query<SubscriptionRow>(
        `INSERT INTO subscriptions (
           user_id, plan, status, provider_customer_id, provider_subscription_id,
           current_period_end, cancel_at_period_end, trial_end, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (user_id) DO UPDATE SET
           plan                     = EXCLUDED.plan,
           status                   = EXCLUDED.status,
           provider_customer_id     = EXCLUDED.provider_customer_id,
           provider_subscription_id = EXCLUDED.provider_subscription_id,
           current_period_end       = EXCLUDED.current_period_end,
           cancel_at_period_end     = EXCLUDED.cancel_at_period_end,
           trial_end                = EXCLUDED.trial_end,
           updated_at               = now()
         RETURNING ${COLUMNS}`,
        [
          subscription.userId,
          subscription.plan,
          subscription.status,
          subscription.providerCustomerId,
          subscription.providerSubscriptionId,
          subscription.currentPeriodEnd,
          subscription.cancelAtPeriodEnd,
          subscription.trialEnd,
        ],
      );
      return map(rows[0]!);
    });
  }

  async findUserByCustomerId(providerCustomerId: string): Promise<string | null> {
    const { rows } = await this.pg.query<{ user_id: string }>(
      'SELECT user_id FROM finverse_subscription_owner($1)',
      [providerCustomerId],
    );
    return rows[0]?.user_id ?? null;
  }
}

export class PostgresBillingEventStore implements BillingEventStore {
  constructor(private readonly pg: Pool) {}

  /**
   * The insert *is* the lock. Two workers handed the same redelivered event
   * race here, and exactly one wins the primary key — checking first and then
   * inserting would let both pass the check before either wrote.
   *
   * `billing_events` carries no RLS policy (see 013_billing.sql), because an
   * event has to be recorded as seen before its user is known.
   */
  async claim(eventId: string, eventType: string): Promise<boolean> {
    const result = await this.pg.query(
      `INSERT INTO billing_events (id, type) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [eventId, eventType],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
