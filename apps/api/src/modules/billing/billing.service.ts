import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { loadConfig } from '../../config';
import {
  bankLinkLimitFor,
  effectivePlan,
  hasEntitlement,
  isPlanId,
  planFor,
  PURCHASABLE_PLANS,
  type Entitlement,
  type PlanId,
} from '../../domain/billing/plans';
import {
  BILLING_EVENT_STORE,
  BILLING_PROVIDER,
  SUBSCRIPTION_STORE,
  type BillingEvent,
  type BillingEventStore,
  type BillingProvider,
  type ProviderSubscription,
  type Subscription,
  type SubscriptionStore,
} from '../../ports/billing';
import { CLOCK, type ClockPort } from '../../ports';
import { USER_STORE, type UserStore } from '../../ports/auth';

export interface PlanSummary {
  plan: PlanId;
  planName: string;
  status: Subscription['status'] | 'none';
  bankLinkLimit: number;
  entitlements: readonly Entitlement[];
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  /** False when billing is not configured, so clients can hide the upgrade UI. */
  purchaseAvailable: boolean;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @Inject(SUBSCRIPTION_STORE) private readonly subscriptions: SubscriptionStore,
    @Inject(BILLING_EVENT_STORE) private readonly events: BillingEventStore,
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * The plan a user is entitled to right now.
   *
   * Every gate in the system routes through here rather than reading the stored
   * row directly, so the fail-closed rules in `effectivePlan` — lapsed period,
   * unknown status, missing row — apply everywhere at once.
   */
  async currentPlan(userId: string): Promise<PlanId> {
    const record = await this.subscriptions.get(userId);
    return effectivePlan(record, this.clock.now());
  }

  async summary(userId: string): Promise<PlanSummary> {
    const record = await this.subscriptions.get(userId);
    const plan = effectivePlan(record, this.clock.now());

    return {
      plan,
      planName: planFor(plan).name,
      status: record?.status ?? 'none',
      bankLinkLimit: bankLinkLimitFor(plan),
      entitlements: planFor(plan).entitlements,
      currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
      trialEnd: record?.trialEnd?.toISOString() ?? null,
      purchaseAvailable: this.provider.configured,
    };
  }

  async requireEntitlement(userId: string, entitlement: Entitlement): Promise<void> {
    const plan = await this.currentPlan(userId);
    if (hasEntitlement(plan, entitlement)) return;

    throw new ForbiddenException({
      error: 'plan_upgrade_required',
      message: `Your ${planFor(plan).name} plan does not include this feature.`,
      entitlement,
      requiredPlan: firstPlanWith(entitlement),
    });
  }

  /** How many more institutions this user may connect. Never negative. */
  async remainingBankLinks(userId: string, connected: number): Promise<number> {
    const limit = bankLinkLimitFor(await this.currentPlan(userId));
    return Math.max(0, limit - connected);
  }

  // ------------------------------------------------------------- purchasing

  /**
   * Starts a hosted checkout.
   *
   * The client sends a plan id and nothing else. Price, currency, and interval
   * come from the provider configuration keyed by that plan — a client that
   * could name a price could name a cheaper one, and this is the one place
   * where trusting the caller costs real money.
   */
  async createCheckoutSession(userId: string, plan: string): Promise<{ url: string; expiresAt: string | null }> {
    this.requireConfigured();

    if (!isPlanId(plan) || !PURCHASABLE_PLANS.includes(plan)) {
      throw new BadRequestException(`Unknown or unpurchasable plan "${plan}".`);
    }

    const user = await this.users.findById(userId);
    if (!user) throw new BadRequestException('Account not found.');

    const existing = await this.subscriptions.get(userId);
    const current = effectivePlan(existing, this.clock.now());
    if (current === plan) {
      throw new BadRequestException('You are already subscribed to that plan.');
    }

    const customerId = await this.provider.ensureCustomer(
      userId,
      user.email,
      existing?.providerCustomerId ?? null,
    );

    // Persist the customer handle before sending the user to pay. If checkout
    // succeeds and this write had not happened, the webhook would name a
    // customer we have never heard of and the payment would strand.
    await this.subscriptions.upsert({
      userId,
      plan: existing?.plan ?? 'free',
      status: existing?.status ?? 'incomplete',
      providerCustomerId: customerId,
      providerSubscriptionId: existing?.providerSubscriptionId ?? null,
      currentPeriodEnd: existing?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
      trialEnd: existing?.trialEnd ?? null,
      updatedAt: this.clock.now(),
    });

    const urls = loadConfig().billing;
    const session = await this.provider.createCheckoutSession({
      customerId,
      plan,
      userId,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });

    return { url: session.url, expiresAt: session.expiresAt?.toISOString() ?? null };
  }

  /**
   * The provider's own management page. Cancellation, plan changes, card
   * updates, and invoice history all live there rather than being rebuilt here —
   * every one of those flows is a place to get billing wrong, and the hosted
   * page is already correct and already PCI-compliant.
   */
  async createPortalSession(userId: string): Promise<{ url: string }> {
    this.requireConfigured();

    const existing = await this.subscriptions.get(userId);
    if (!existing) throw new BadRequestException('There is no billing account to manage yet.');

    return this.provider.createPortalSession(
      existing.providerCustomerId,
      loadConfig().billing.portalReturnUrl,
    );
  }

  // ---------------------------------------------------------------- webhooks

  /**
   * Applies a verified provider event.
   *
   * Two hazards are handled here rather than in the adapter:
   *
   *  - **Redelivery.** Providers guarantee at-least-once, so the same event
   *    arrives more than once. `claim` is an insert on a primary key, so
   *    exactly one caller proceeds.
   *  - **Out-of-order delivery.** Events are *not* ordered, so a stale
   *    `updated` can arrive after a `deleted` and resurrect a cancelled
   *    subscription. Rather than trusting the payload's age, the current state
   *    is re-read from the provider, which is the only real source of truth.
   *    The payload is the fallback when that read fails.
   */
  async applyEvent(event: BillingEvent): Promise<'applied' | 'duplicate' | 'ignored'> {
    if (event.kind === 'ignored') return 'ignored';

    const fresh = await this.events.claim(event.id, event.type);
    if (!fresh) return 'duplicate';

    if (!event.providerCustomerId) {
      this.logger.warn(`Billing event ${event.id} (${event.type}) named no customer; skipped.`);
      return 'ignored';
    }

    const userId = await this.subscriptions.findUserByCustomerId(event.providerCustomerId);
    if (!userId) {
      // Normal during testing against a shared Stripe account, and worth a log
      // line rather than an error: the event is genuinely not ours.
      this.logger.warn(`Billing event ${event.id} named an unknown customer; skipped.`);
      return 'ignored';
    }

    const existing = await this.subscriptions.get(userId);
    const subscriptionId =
      event.subscription?.providerSubscriptionId ?? existing?.providerSubscriptionId ?? null;

    const authoritative = subscriptionId
      ? (await this.provider.fetchSubscription(subscriptionId)) ?? event.subscription
      : event.subscription;

    if (!authoritative) {
      this.logger.warn(`Billing event ${event.id} carried no resolvable subscription.`);
      return 'ignored';
    }

    await this.persist(userId, event.providerCustomerId, authoritative);
    return 'applied';
  }

  private async persist(
    userId: string,
    customerId: string,
    subscription: ProviderSubscription,
  ): Promise<void> {
    await this.subscriptions.upsert({
      userId,
      // A subscription the provider reports as over entitles nothing, whatever
      // price it carried. `effectivePlan` would reach the same answer from the
      // status; storing it this way keeps the row itself readable during support.
      plan: subscription.status === 'canceled' ? 'free' : subscription.plan,
      status: subscription.status,
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.providerSubscriptionId,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEnd: subscription.trialEnd,
      updatedAt: this.clock.now(),
    });
  }

  private requireConfigured(): void {
    if (!this.provider.configured) {
      throw new ServiceUnavailableException(
        'Billing is not configured on this deployment.',
      );
    }
  }
}

function firstPlanWith(entitlement: Entitlement): PlanId {
  return PURCHASABLE_PLANS.find((plan) => hasEntitlement(plan, entitlement)) ?? 'pro';
}
