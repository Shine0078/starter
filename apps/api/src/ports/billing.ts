import type { BillingInterval, PlanId, SubscriptionStatus } from '../domain/billing/plans';

export const BILLING_PROVIDER = 'BILLING_PROVIDER';
export const SUBSCRIPTION_STORE = 'SUBSCRIPTION_STORE';
export const BILLING_EVENT_STORE = 'BILLING_EVENT_STORE';

/**
 * What FINVERSE stores about a subscription.
 *
 * Note what is absent: no card number, no last four, no expiry, no billing
 * address. Card data never reaches this system — checkout happens on the
 * provider's own hosted page, and keeping it that way is what keeps PCI DSS out
 * of scope (see docs/03-security-privacy.md). The moment this interface grows a
 * `cardNumber` field, that argument is over.
 */
export interface Subscription {
  userId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  /** The provider's customer handle. Opaque to us. */
  providerCustomerId: string;
  /** The provider's subscription handle. Null while only a customer exists. */
  providerSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  updatedAt: Date;
}

export interface SubscriptionStore {
  get(userId: string): Promise<Subscription | null>;
  /** Insert or update the row for this user. One subscription per user. */
  upsert(subscription: Subscription): Promise<Subscription>;
  /**
   * Route a provider webhook to a user. The webhook names a customer, not a
   * FINVERSE user, and the runtime role is under forced RLS — so this is
   * deliberately the only path that reads across users, and it returns nothing
   * but the id needed to enter the right scope.
   */
  findUserByCustomerId(providerCustomerId: string): Promise<string | null>;
}

/**
 * Webhook de-duplication.
 *
 * Providers guarantee at-least-once delivery, so the same event will arrive
 * twice. Without this a duplicate `subscription.deleted` could downgrade a
 * customer who has since resubscribed, and a replayed event is also the obvious
 * attack once an endpoint is public.
 */
export interface BillingEventStore {
  /** True when this event has not been seen before and should be processed. */
  claim(eventId: string, eventType: string): Promise<boolean>;
}

export type BillingEventKind =
  | 'checkout_completed'
  | 'subscription_updated'
  | 'subscription_deleted'
  | 'ignored';

/**
 * The provider-agnostic shape of a billing webhook. Stripe's event taxonomy is
 * much larger than this; the adapter collapses it to the four cases the domain
 * actually acts on, and reports everything else as `ignored` rather than
 * throwing — an unrecognised event is normal, not an error.
 */
export interface BillingEvent {
  id: string;
  type: string;
  kind: BillingEventKind;
  providerCustomerId: string | null;
  subscription: ProviderSubscription | null;
}

export interface ProviderSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
}

export interface CheckoutSession {
  /** Where to send the customer to pay. Always the provider's hosted page. */
  url: string;
  expiresAt: Date | null;
}

export interface BillingProvider {
  readonly name: 'stripe';
  configured: boolean;
  /** The price selling this plan at this interval, or null if not configured. */
  priceIdFor(plan: PlanId, interval: BillingInterval): string | null;
  /** Intervals this deployment can actually sell for a plan. */
  intervalsFor(plan: PlanId): BillingInterval[];
  /** Days of free trial on a new subscription. Zero means none. */
  readonly trialDays: number;
  ensureCustomer(userId: string, email: string, existingId: string | null): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    plan: PlanId;
    interval: BillingInterval;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  /** The provider's own subscription-management page: cancel, change card. */
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Verifies the signature against the exact raw bytes, then parses. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent;
  /** Re-reads state from the provider, which is always the source of truth. */
  fetchSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null>;
}
