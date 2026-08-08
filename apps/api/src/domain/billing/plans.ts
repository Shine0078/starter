/**
 * The plan catalogue and what each plan is allowed to do.
 *
 * Pricing is a product decision, not an engineering one. What this file does is
 * make it a *one-file* decision: the tiers, the limits, and the feature gates
 * are data here, and everything downstream — the guard, the controller, the
 * mobile client — reads from this table rather than hardcoding a plan name.
 *
 * Prices deliberately do **not** live here. The amount a customer is charged is
 * whatever Stripe has recorded against the price id, and duplicating it in the
 * codebase creates a second source of truth that will eventually disagree with
 * the one that actually takes the money. The API reports the price id and lets
 * the billing provider describe it.
 */

export type PlanId = 'free' | 'pro';

/**
 * Named capabilities, so a route asks for what it needs rather than naming a
 * tier. Moving `monthly_pdf_report` from pro to free then means editing one
 * line below instead of hunting for `=== 'pro'` across the codebase.
 */
export type Entitlement =
  | 'unlimited_bank_links'
  | 'monthly_pdf_report'
  | 'cash_flow_planning'
  | 'data_export';

export interface Plan {
  id: PlanId;
  name: string;
  /** How many institutions may be connected at once. */
  bankLinkLimit: number;
  entitlements: readonly Entitlement[];
}

/**
 * The free tier is deliberately useful rather than crippled. A finance app that
 * shows you nothing until you pay cannot demonstrate that it is worth paying
 * for, and the expensive resource here is the aggregator connection — which is
 * what the link limit actually meters.
 *
 * Export is free on purpose. Holding someone's financial data hostage behind a
 * subscription is the opposite of the mission's "user owns their data", and in
 * several jurisdictions data portability is a right rather than a feature.
 */
export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: {
    id: 'free',
    name: 'Free',
    bankLinkLimit: 1,
    entitlements: ['data_export'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    bankLinkLimit: 25,
    entitlements: [
      'unlimited_bank_links',
      'monthly_pdf_report',
      'cash_flow_planning',
      'data_export',
    ],
  },
};

export const DEFAULT_PLAN: PlanId = 'free';

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro';
}

/** Plans a customer can actually buy. `free` is the absence of a purchase. */
export const PURCHASABLE_PLANS: readonly PlanId[] = ['pro'];

/**
 * Provider-reported subscription states, named as Stripe names them so that
 * mapping is a lookup rather than a translation anyone has to reason about.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

/**
 * Which states still entitle the customer to the plan they bought.
 *
 * `past_due` is deliberately included. A card that failed a renewal is usually
 * an expired card, not a person who decided to stop paying, and cutting off
 * access to their own financial history on the first failed charge is both
 * hostile and bad business — Stripe's dunning retries over roughly two weeks
 * before giving up, and `unpaid`/`canceled` is where that ends.
 */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'trialing',
  'active',
  'past_due',
]);

export interface PlanStateInput {
  plan: PlanId;
  status: SubscriptionStatus;
  /**
   * When the paid period ends. A subscription that Stripe last told us was
   * active but whose period ended long ago means we have missed webhooks, and
   * the safe reading of "we do not know" is the free tier.
   */
  currentPeriodEnd: Date | null;
}

/**
 * The plan a user is entitled to right now.
 *
 * Fails closed in every ambiguous case: no record, an unknown status, or a
 * lapsed period all resolve to `free`. The cost of that mistake is a paying
 * customer briefly seeing an upgrade prompt, which they will report. The cost
 * of failing open is giving away the product silently, which nobody reports.
 */
export function effectivePlan(state: PlanStateInput | null, now: Date): PlanId {
  if (!state) return DEFAULT_PLAN;
  if (!ENTITLING_STATUSES.has(state.status)) return DEFAULT_PLAN;

  // A grace window absorbs clock skew and the gap between a renewal being
  // charged and its webhook arriving. Without it, every renewal would flicker
  // the customer down to free for a few seconds.
  const GRACE_MS = 24 * 60 * 60 * 1000;
  if (state.currentPeriodEnd && state.currentPeriodEnd.getTime() + GRACE_MS < now.getTime()) {
    return DEFAULT_PLAN;
  }

  return state.plan;
}

export function planFor(id: PlanId): Plan {
  return PLANS[id];
}

export function hasEntitlement(planId: PlanId, entitlement: Entitlement): boolean {
  return PLANS[planId].entitlements.includes(entitlement);
}

export function bankLinkLimitFor(planId: PlanId): number {
  return PLANS[planId].bankLinkLimit;
}
