import Stripe from 'stripe';

import { isPlanId, type PlanId, type SubscriptionStatus } from '../../domain/billing/plans';
import type {
  BillingEvent,
  BillingProvider,
  CheckoutSession,
  ProviderSubscription,
} from '../../ports/billing';

export interface StripeProviderOptions {
  secretKey?: string;
  webhookSecret?: string;
  /** Price id per purchasable plan, from the Stripe dashboard. */
  priceIds: Partial<Record<PlanId, string>>;
}

/**
 * The metadata key that carries our user id into Stripe and back out again.
 *
 * Webhooks are matched on the customer id, not on this — metadata is
 * convenience, the customer id is the contract. It exists so a human reading
 * the Stripe dashboard during a support call can tell which account a
 * subscription belongs to.
 */
const USER_ID_METADATA = 'finverse_user_id';

export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe' as const;
  readonly configured: boolean;
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly priceIds: Partial<Record<PlanId, string>>;

  constructor(options: StripeProviderOptions) {
    const { secretKey, webhookSecret, priceIds } = options;
    this.configured = Boolean(secretKey);
    this.webhookSecret = webhookSecret;
    this.priceIds = priceIds;

    // Half-configured billing is the dangerous state: checkout would work and
    // webhooks would be rejected, so customers would be charged and never
    // entitled. Refuse to start instead.
    if (this.configured && !webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set. Without it every ' +
          'webhook is rejected, so customers would be charged and never receive their plan.',
      );
    }
    if (this.configured && !priceIds.pro) {
      throw new Error('STRIPE_PRICE_ID_PRO is required when Stripe is configured.');
    }
    if (secretKey && !/^sk_(test|live)_/.test(secretKey)) {
      // A publishable key here would fail on first use with an opaque 401.
      throw new Error('STRIPE_SECRET_KEY must be a secret key (sk_test_… or sk_live_…).');
    }

    this.client = secretKey
      ? new Stripe(secretKey, {
          // Pinned deliberately. Stripe rolls the account default forward, and
          // an unpinned integration changes shape underneath a running
          // deployment — this SDK's types are generated for this version.
          apiVersion: '2026-07-29.dahlia',
          maxNetworkRetries: 2,
          timeout: 20_000,
          appInfo: { name: 'FINVERSE' },
        })
      : null;
  }

  priceIdFor(plan: PlanId): string | null {
    return this.priceIds[plan] ?? null;
  }

  async ensureCustomer(userId: string, email: string, existingId: string | null): Promise<string> {
    const client = this.requireClient();

    if (existingId) {
      // Confirm it still exists and has not been deleted in the dashboard;
      // a stale id makes every later call fail in a way that reads as an outage.
      try {
        const found = await client.customers.retrieve(existingId);
        if (!found.deleted) return found.id;
      } catch {
        // Fall through and create a replacement.
      }
    }

    const created = await client.customers.create({
      email,
      metadata: { [USER_ID_METADATA]: userId },
    });
    return created.id;
  }

  async createCheckoutSession(input: {
    customerId: string;
    plan: PlanId;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    const client = this.requireClient();
    const price = this.priceIdFor(input.plan);
    if (!price) throw new Error(`No configured price for plan "${input.plan}".`);

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Stripe Tax computes and collects where we are registered. Registration
      // itself is a filing obligation, not a flag — see docs/08.
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto' },
      subscription_data: { metadata: { [USER_ID_METADATA]: input.userId } },
      metadata: { [USER_ID_METADATA]: input.userId },
    });

    if (!session.url) throw new Error('Stripe returned a checkout session with no URL.');
    return {
      url: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.requireClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  parseWebhook(rawBody: Buffer, signature: string): BillingEvent {
    const client = this.requireClient();
    if (!this.webhookSecret) throw new Error('Stripe webhook secret is not configured.');

    // Throws on a bad signature, a mismatched body, or a timestamp outside the
    // tolerance window — which is what makes this endpoint safe to expose.
    const event = client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return toBillingEvent(event, (id) => this.planForPrice(id));
  }

  async fetchSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null> {
    try {
      const subscription = await this.requireClient().subscriptions.retrieve(providerSubscriptionId);
      return toProviderSubscription(subscription, (id) => this.planForPrice(id));
    } catch {
      return null;
    }
  }

  /** Maps a Stripe price back to the plan it sells. */
  private planForPrice(priceId: string | null): PlanId | null {
    if (!priceId) return null;
    for (const [plan, configured] of Object.entries(this.priceIds)) {
      if (configured === priceId && isPlanId(plan)) return plan;
    }
    return null;
  }

  private requireClient(): Stripe {
    if (!this.client) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
    }
    return this.client;
  }
}

// ------------------------------------------------------------------- mapping

/**
 * Stripe's event taxonomy is large and mostly irrelevant to entitlement. These
 * are the events that change what a customer may do; everything else is
 * reported as `ignored` rather than throwing, because receiving an event we do
 * not care about is normal operation, not a fault.
 */
export function toBillingEvent(
  event: Stripe.Event,
  planForPrice: (priceId: string | null) => PlanId | null,
): BillingEvent {
  const base = { id: event.id, type: event.type };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      return {
        ...base,
        kind: 'checkout_completed',
        providerCustomerId: idOf(session.customer),
        // Checkout carries no usable subscription object; the service reads the
        // state from the provider once the customer is known.
        subscription: null,
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object;
      return {
        ...base,
        kind: 'subscription_updated',
        providerCustomerId: idOf(subscription.customer),
        subscription: toProviderSubscription(subscription, planForPrice),
      };
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      return {
        ...base,
        kind: 'subscription_deleted',
        providerCustomerId: idOf(subscription.customer),
        subscription: toProviderSubscription(subscription, planForPrice),
      };
    }
    default:
      return { ...base, kind: 'ignored', providerCustomerId: null, subscription: null };
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Reads the entitlement-relevant fields off a Stripe subscription.
 *
 * `current_period_end` moved from the subscription onto its items in the 2025
 * API versions, so it is read from the items and the **latest** one wins — a
 * subscription with several items is entitled until the last of them lapses.
 * The legacy top-level field is still honoured so that pinning an older API
 * version does not silently produce a null period and downgrade everyone.
 */
export function toProviderSubscription(
  subscription: Stripe.Subscription,
  planForPrice: (priceId: string | null) => PlanId | null,
): ProviderSubscription {
  const items = subscription.items?.data ?? [];

  const periodEnds = items
    .map((item) => (item as { current_period_end?: number }).current_period_end)
    .filter((value): value is number => typeof value === 'number');
  const legacyEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
  if (typeof legacyEnd === 'number') periodEnds.push(legacyEnd);

  const currentPeriodEnd = periodEnds.length > 0 ? new Date(Math.max(...periodEnds) * 1000) : null;

  // The first item that maps to a plan we sell decides the plan. An unmapped
  // price resolves to `free` upstream, which fails closed.
  let plan: PlanId | null = null;
  for (const item of items) {
    plan = planForPrice(item.price?.id ?? null);
    if (plan) break;
  }

  return {
    providerSubscriptionId: subscription.id,
    providerCustomerId: idOf(subscription.customer) ?? '',
    plan: plan ?? 'free',
    status: toStatus(subscription.status),
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
  };
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

/** An unrecognised status resolves to `canceled`, which entitles nothing. */
function toStatus(status: string): SubscriptionStatus {
  return KNOWN_STATUSES.has(status) ? (status as SubscriptionStatus) : 'canceled';
}
