/**
 * A real BillingService wired to in-memory adapters.
 *
 * Deliberately the real service rather than a stub: the entitlement rules —
 * fail-closed on a lapsed period, the grace window, the free-tier link limit —
 * are exactly what the tests need to exercise, and a stub would assert that the
 * stub works.
 */

import { FixedClock } from '../src/infra/clock';
import { InMemoryUserStore } from '../src/infra/auth/in-memory-auth-stores';
import {
  InMemoryBillingEventStore,
  InMemorySubscriptionStore,
} from '../src/infra/billing/subscription-stores';
import { BillingService } from '../src/modules/billing/billing.service';
import type { BillingProvider, ProviderSubscription } from '../src/ports/billing';
import type { PlanId } from '../src/domain/billing/plans';

/**
 * A provider that never talks to Stripe.
 *
 * `fetchSubscription` returns whatever is put in `remote`, which is how the
 * out-of-order webhook behaviour gets tested: the service is supposed to prefer
 * this over the event payload.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly name = 'stripe' as const;
  configured = true;
  remote: ProviderSubscription | null = null;
  /** Set to true to simulate the provider being unreachable. */
  fetchFails = false;
  customers: Array<{ userId: string; email: string }> = [];
  portalCalls = 0;

  priceIdFor(plan: PlanId): string | null {
    return plan === 'pro' ? 'price_pro_test' : null;
  }
  async ensureCustomer(userId: string, email: string, existingId: string | null): Promise<string> {
    if (existingId) return existingId;
    this.customers.push({ userId, email });
    return `cus_${userId}`;
  }
  async createCheckoutSession(input: { customerId: string }) {
    return { url: `https://checkout.test/${input.customerId}`, expiresAt: null };
  }
  async createPortalSession(customerId: string) {
    this.portalCalls += 1;
    return { url: `https://portal.test/${customerId}` };
  }
  parseWebhook(): never {
    throw new Error('Not used: tests build BillingEvents directly.');
  }
  async fetchSubscription(): Promise<ProviderSubscription | null> {
    if (this.fetchFails) return null;
    return this.remote;
  }
}

export interface BillingHarness {
  billing: BillingService;
  provider: FakeBillingProvider;
  subscriptions: InMemorySubscriptionStore;
  events: InMemoryBillingEventStore;
  users: InMemoryUserStore;
  clock: FixedClock;
}

export function billingHarness(today = '2026-08-08'): BillingHarness {
  const provider = new FakeBillingProvider();
  const subscriptions = new InMemorySubscriptionStore();
  const events = new InMemoryBillingEventStore();
  const users = new InMemoryUserStore();
  const clock = new FixedClock(today);

  return {
    billing: new BillingService(provider, subscriptions, events, users, clock),
    provider,
    subscriptions,
    events,
    users,
    clock,
  };
}
