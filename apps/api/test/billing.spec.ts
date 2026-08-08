/**
 * Billing correctness.
 *
 * The failure modes here are the quiet ones, the same shape as the financial
 * bugs listed in docs/07: nothing crashes, a number is just wrong. Either a
 * paying customer silently loses access, or someone who stopped paying silently
 * keeps it. Both are covered below, along with the two delivery hazards every
 * webhook integration has to survive — redelivery and out-of-order arrival.
 */

import { describe, expect, it } from 'vitest';

import {
  bankLinkLimitFor,
  effectivePlan,
  hasEntitlement,
  isPlanId,
  PLANS,
  PURCHASABLE_PLANS,
} from '../src/domain/billing/plans';
import { toBillingEvent, toProviderSubscription } from '../src/infra/billing/stripe-provider';
import { InMemorySubscriptionStore } from '../src/infra/billing/subscription-stores';
import type { BillingEvent, ProviderSubscription } from '../src/ports/billing';
import { billingHarness } from './billing-fixtures';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const LATER = new Date('2026-09-08T12:00:00.000Z');

function proSubscription(overrides: Partial<ProviderSubscription> = {}): ProviderSubscription {
  return {
    providerSubscriptionId: 'sub_1',
    providerCustomerId: 'cus_user-1',
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: LATER,
    cancelAtPeriodEnd: false,
    trialEnd: null,
    ...overrides,
  };
}

function event(overrides: Partial<BillingEvent> = {}): BillingEvent {
  return {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    kind: 'subscription_updated',
    providerCustomerId: 'cus_user-1',
    subscription: proSubscription(),
    ...overrides,
  };
}

// --------------------------------------------------------------- entitlement

describe('plan entitlement', () => {
  it('gives an unsubscribed user the free plan', () => {
    expect(effectivePlan(null, NOW)).toBe('free');
  });

  it('entitles an active subscriber to what they bought', () => {
    expect(effectivePlan({ plan: 'pro', status: 'active', currentPeriodEnd: LATER }, NOW)).toBe('pro');
  });

  it('keeps a past_due subscriber entitled while dunning runs', () => {
    // A failed renewal is usually an expired card, not a decision to leave.
    // Cutting access off on the first failed charge loses customers who would
    // have paid, and Stripe retries for roughly two weeks before giving up.
    expect(effectivePlan({ plan: 'pro', status: 'past_due', currentPeriodEnd: LATER }, NOW)).toBe('pro');
  });

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const)(
    'entitles nothing when the subscription is %s',
    (status) => {
      expect(effectivePlan({ plan: 'pro', status, currentPeriodEnd: LATER }, NOW)).toBe('free');
    },
  );

  it('entitles a trialing subscriber', () => {
    expect(effectivePlan({ plan: 'pro', status: 'trialing', currentPeriodEnd: LATER }, NOW)).toBe('pro');
  });

  it('drops to free when the paid period lapsed long ago', () => {
    // "Active" with a period that ended weeks back means we have missed
    // webhooks. The safe reading of "we do not know" is the free tier.
    const stale = { plan: 'pro' as const, status: 'active' as const, currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z') };
    expect(effectivePlan(stale, NOW)).toBe('free');
  });

  it('holds the plan through the renewal grace window', () => {
    // Without this, every renewal flickers the customer down to free for the
    // seconds between the charge and its webhook.
    const justEnded = {
      plan: 'pro' as const,
      status: 'active' as const,
      currentPeriodEnd: new Date(NOW.getTime() - 60_000),
    };
    expect(effectivePlan(justEnded, NOW)).toBe('pro');
  });

  it('treats a null period end as still entitled', () => {
    // Stripe omits the period on some states; absence is not expiry.
    expect(effectivePlan({ plan: 'pro', status: 'active', currentPeriodEnd: null }, NOW)).toBe('pro');
  });
});

describe('plan catalogue', () => {
  it('never gates data export behind a paid plan', () => {
    // Portability is a right in several jurisdictions and a mission promise
    // ("user owns their data"). Holding it hostage would break both.
    for (const plan of Object.values(PLANS)) {
      expect(hasEntitlement(plan.id, 'data_export')).toBe(true);
    }
  });

  it('gives every free user at least one bank connection', () => {
    expect(bankLinkLimitFor('free')).toBeGreaterThan(0);
  });

  it('only offers plans that are actually purchasable', () => {
    for (const plan of PURCHASABLE_PLANS) {
      expect(isPlanId(plan)).toBe(true);
      expect(plan).not.toBe('free');
    }
  });
});

// ------------------------------------------------------------------ webhooks

describe('webhook application', () => {
  async function subscribed() {
    const harness = billingHarness();
    // The customer row exists before checkout, which is what lets a webhook
    // route back to a user at all.
    await harness.subscriptions.upsert({
      userId: 'user-1',
      plan: 'free',
      status: 'incomplete',
      providerCustomerId: 'cus_user-1',
      providerSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      updatedAt: NOW,
    });
    return harness;
  }

  it('upgrades a user when their subscription becomes active', async () => {
    const h = await subscribed();
    h.provider.remote = proSubscription();

    expect(await h.billing.applyEvent(event())).toBe('applied');
    expect(await h.billing.currentPlan('user-1')).toBe('pro');
  });

  it('ignores a redelivered event', async () => {
    const h = await subscribed();
    h.provider.remote = proSubscription();

    expect(await h.billing.applyEvent(event())).toBe('applied');
    // Same event id: at-least-once delivery means this *will* happen.
    expect(await h.billing.applyEvent(event())).toBe('duplicate');
  });

  it('does not resurrect a cancelled subscription from a stale event', async () => {
    const h = await subscribed();

    // The subscription is cancelled at the provider...
    h.provider.remote = proSubscription({ status: 'canceled' });
    expect(await h.billing.applyEvent(event({ id: 'evt_cancel', kind: 'subscription_deleted' }))).toBe('applied');
    expect(await h.billing.currentPlan('user-1')).toBe('free');

    // ...and now an *older* "active" event arrives late. Events are not
    // ordered, so this is ordinary, not exotic. The provider is re-read rather
    // than the payload trusted, so the customer stays cancelled.
    const stale = event({ id: 'evt_stale', subscription: proSubscription({ status: 'active' }) });
    expect(await h.billing.applyEvent(stale)).toBe('applied');
    expect(await h.billing.currentPlan('user-1')).toBe('free');
  });

  it('falls back to the event payload when the provider cannot be reached', async () => {
    const h = await subscribed();
    h.provider.fetchFails = true;

    expect(await h.billing.applyEvent(event())).toBe('applied');
    expect(await h.billing.currentPlan('user-1')).toBe('pro');
  });

  it('skips an event naming a customer we do not know', async () => {
    const h = billingHarness();
    h.provider.remote = proSubscription();
    expect(await h.billing.applyEvent(event({ providerCustomerId: 'cus_stranger' }))).toBe('ignored');
  });

  it('skips events it does not act on without consuming their id', async () => {
    const h = await subscribed();
    const outcome = await h.billing.applyEvent(
      event({ id: 'evt_noise', type: 'invoice.created', kind: 'ignored' }),
    );
    expect(outcome).toBe('ignored');
  });

  it('records a cancelled subscription as the free plan', async () => {
    const h = await subscribed();
    h.provider.remote = proSubscription({ status: 'canceled' });
    await h.billing.applyEvent(event({ kind: 'subscription_deleted' }));

    const stored = await h.subscriptions.get('user-1');
    expect(stored?.plan).toBe('free');
    expect(stored?.status).toBe('canceled');
  });
});

// ------------------------------------------------------------------ checkout

describe('checkout', () => {
  it('refuses a plan the client made up', async () => {
    const h = billingHarness();
    await h.users.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'x', displayName: null });

    // The client sends a plan id, never a price. A client that could name a
    // price could name a cheaper one.
    await expect(h.billing.createCheckoutSession('user-1', 'enterprise')).rejects.toThrow(/Unknown or unpurchasable/);
    await expect(h.billing.createCheckoutSession('user-1', 'free')).rejects.toThrow(/Unknown or unpurchasable/);
  });

  it('stores the customer handle before sending the user to pay', async () => {
    const h = billingHarness();
    await h.users.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'x', displayName: null });

    await h.billing.createCheckoutSession('user-1', 'pro');

    // If this write had not happened, a completed payment would arrive naming a
    // customer we have never heard of, and the money would strand.
    expect((await h.subscriptions.get('user-1'))?.providerCustomerId).toBe('cus_user-1');
  });

  it('refuses to sell a plan the user already has', async () => {
    const h = billingHarness();
    await h.users.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'x', displayName: null });
    await h.subscriptions.upsert({
      userId: 'user-1', plan: 'pro', status: 'active', providerCustomerId: 'cus_user-1',
      providerSubscriptionId: 'sub_1', currentPeriodEnd: LATER, cancelAtPeriodEnd: false,
      trialEnd: null, updatedAt: NOW,
    });

    await expect(h.billing.createCheckoutSession('user-1', 'pro')).rejects.toThrow(/already subscribed/);
  });

  it('reports billing as unavailable when it is not configured', async () => {
    const h = billingHarness();
    h.provider.configured = false;
    await h.users.create({ id: 'user-1', email: 'a@example.com', passwordHash: 'x', displayName: null });

    await expect(h.billing.createCheckoutSession('user-1', 'pro')).rejects.toThrow(/not configured/);
    expect((await h.billing.summary('user-1')).purchaseAvailable).toBe(false);
  });

  it('has nothing to manage before a customer exists', async () => {
    const h = billingHarness();
    await expect(h.billing.createPortalSession('user-1')).rejects.toThrow(/no billing account/);
  });
});

// --------------------------------------------------------------------- gates

describe('entitlement gates', () => {
  it('refuses a paid feature on the free plan and names the plan needed', async () => {
    const h = billingHarness();
    await expect(h.billing.requireEntitlement('user-1', 'monthly_pdf_report')).rejects.toMatchObject({
      response: { error: 'plan_upgrade_required', requiredPlan: 'pro' },
    });
  });

  it('allows a paid feature once subscribed', async () => {
    const h = billingHarness();
    await h.subscriptions.upsert({
      userId: 'user-1', plan: 'pro', status: 'active', providerCustomerId: 'cus_user-1',
      providerSubscriptionId: 'sub_1', currentPeriodEnd: LATER, cancelAtPeriodEnd: false,
      trialEnd: null, updatedAt: NOW,
    });
    await expect(h.billing.requireEntitlement('user-1', 'monthly_pdf_report')).resolves.toBeUndefined();
  });

  it('meters bank links by plan and never reports a negative allowance', async () => {
    const h = billingHarness();
    expect(await h.billing.remainingBankLinks('user-1', 0)).toBe(bankLinkLimitFor('free'));
    expect(await h.billing.remainingBankLinks('user-1', 1)).toBe(0);
    expect(await h.billing.remainingBankLinks('user-1', 99)).toBe(0);
  });
});

// ------------------------------------------------------------------- storage

describe('subscription storage', () => {
  it('refuses to attach one billing customer to two accounts', async () => {
    // Mirrors the unique constraint in 013_billing.sql. Two users sharing a
    // customer would make every webhook ambiguous and could entitle the wrong
    // account.
    const store = new InMemorySubscriptionStore();
    const row = {
      plan: 'pro' as const, status: 'active' as const, providerCustomerId: 'cus_shared',
      providerSubscriptionId: 'sub_1', currentPeriodEnd: LATER, cancelAtPeriodEnd: false,
      trialEnd: null, updatedAt: NOW,
    };
    await store.upsert({ ...row, userId: 'user-1' });
    await expect(store.upsert({ ...row, userId: 'user-2' })).rejects.toThrow(/another account/);
  });
});

// ------------------------------------------------------------ stripe mapping

describe('stripe mapping', () => {
  const planForPrice = (id: string | null) => (id === 'price_pro_test' ? ('pro' as const) : null);

  it('reads the period end from subscription items', () => {
    // Stripe moved current_period_end from the subscription onto its items in
    // the 2025 API versions. Reading the old location returns undefined, which
    // would downgrade every paying customer at once.
    const end = Math.floor(LATER.getTime() / 1000);
    const mapped = toProviderSubscription(
      {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        trial_end: null,
        items: { data: [{ price: { id: 'price_pro_test' }, current_period_end: end }] },
      } as never,
      planForPrice,
    );

    expect(mapped.currentPeriodEnd?.toISOString()).toBe(LATER.toISOString());
    expect(mapped.plan).toBe('pro');
  });

  it('entitles until the latest item period when there are several', () => {
    const early = Math.floor(NOW.getTime() / 1000);
    const late = Math.floor(LATER.getTime() / 1000);
    const mapped = toProviderSubscription(
      {
        id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, trial_end: null,
        items: { data: [
          { price: { id: 'price_pro_test' }, current_period_end: early },
          { price: { id: 'price_other' }, current_period_end: late },
        ] },
      } as never,
      planForPrice,
    );
    expect(mapped.currentPeriodEnd?.toISOString()).toBe(LATER.toISOString());
  });

  it('maps an unknown price to the free plan rather than guessing', () => {
    const mapped = toProviderSubscription(
      {
        id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, trial_end: null,
        items: { data: [{ price: { id: 'price_unrecognised' }, current_period_end: 1 }] },
      } as never,
      planForPrice,
    );
    expect(mapped.plan).toBe('free');
  });

  it('maps an unrecognised status to one that entitles nothing', () => {
    const mapped = toProviderSubscription(
      {
        id: 'sub_1', customer: 'cus_1', status: 'something_new', cancel_at_period_end: false,
        trial_end: null, items: { data: [] },
      } as never,
      planForPrice,
    );
    expect(effectivePlan({ plan: 'pro', status: mapped.status, currentPeriodEnd: LATER }, NOW)).toBe('free');
  });

  it('reports events it does not act on as ignored rather than throwing', () => {
    // An unrecognised event is normal operation. Throwing would return non-2xx,
    // which tells Stripe to redeliver — forever.
    const mapped = toBillingEvent(
      { id: 'evt_1', type: 'invoice.created', data: { object: {} } } as never,
      planForPrice,
    );
    expect(mapped.kind).toBe('ignored');
  });
});
