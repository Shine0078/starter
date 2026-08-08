# Pricing

The commercial model, why it is shaped this way, and where to change it.

**This is a recommendation, not a fact.** The tier *structure* is implemented and
tested; the *numbers* below are a starting position argued from competitor
pricing and this product's cost structure, and they are yours to overrule. The
code is deliberately arranged so that changing them is configuration rather than
engineering — see [Changing any of this](#changing-any-of-this).

---

## The model

| | Free | Pro |
|---|---|---|
| **Price** | — | **$8.99/month** or **$79/year** |
| Connected institutions | 1 | 25 |
| Transactions, categorisation, corrections | ✓ | ✓ |
| Budgets and goals | ✓ | ✓ |
| Monthly insights and health score | ✓ | ✓ |
| Subscription detection and price-rise alerts | ✓ | ✓ |
| Credit-card utilisation and payment window | ✓ | ✓ |
| Notifications and alerts | ✓ | ✓ |
| Manual accounts, assets, and debts | ✓ | ✓ |
| Full data export | ✓ | ✓ |
| **Cash-flow forecast (7/30/90 day)** | — | ✓ |
| **Purchase simulator** | — | ✓ |
| **Monthly PDF report** | — | ✓ |

**14-day free trial** on Pro, card required, cancel any time.

## The one sentence

> **Free tells you where your money went. Pro tells you what happens next.**

A paywall a customer can explain to themselves converts better than one built
from a feature checklist, and it survives contact with a support conversation. It
also happens to be the honest description of where the expensive work is.

Everything backward-looking is free: a finance app that shows a new user nothing
cannot demonstrate that it is worth paying for, and the backward-looking features
are what earn the trust needed to connect a second bank. Everything
forward-looking is paid, because the forecast and the simulator are what this
product is actually differentiated on — the MISSION brief names cash-flow
forecasting as a headline capability, and headline capabilities are what people
pay for.

## Why these numbers

Competitors, at the time of writing:

| Product | Monthly | Annual |
|---|---|---|
| Monarch Money | ~$14.99 | ~$99.99 |
| YNAB | ~$14.99 | ~$109 |
| Copilot Money | ~$13 | ~$95 |
| PocketGuard | ~$12.99 | ~$74.99 |
| Emma | ~$9.99 | — |

**$8.99/month** sits deliberately below the leaders. A new entrant with no brand,
no track record, and a mock aggregator behind it does not get to price at
parity — the first job is to be obviously worth trying, not to maximise revenue
per user. There is room to raise later; there is much less room to cut.

**$79/year** is a ~27% discount, close to "two months free", which is the
convention customers already recognise. Annual is preselected in the app because
it front-loads cash and cuts churn sharply, and both matter far more than ARPU at
this stage.

**14 days** is long enough to span a pay cycle and see the forecast do something
real, and short enough that the decision does not get forgotten. The app states
the charge that follows plainly on the button — a trial that quietly becomes a
charge is the most common complaint about subscription apps and costs more in
refunds and chargebacks than it gains in signups.

## The economics you need to watch

**Free users cost money.** Every connected institution is a per-Item monthly fee
at the aggregator, so a free tier that includes one live connection is a real,
recurring cost of acquisition rather than a free marketing channel. At Plaid's
published ranges that is roughly $0.30–$1.50 per free user per month, and your
negotiated rate decides where in that band you land.

That is a deliberate bet: one working bank connection is what makes the free tier
a real product rather than a demo, and needing a second is the single most common
reason to upgrade. **If the unit economics do not work, the lever is
`bankLinkLimit` on the free plan.** Setting it to `0` makes free a manual-only
tier with near-zero cost to serve, at the price of a much harsher funnel. That is
one number in one file.

**The Pro cap is not decoration.** 25 institutions is far beyond any household,
and it exists so that a single compromised or automated account cannot run up an
unbounded aggregator bill. "Unlimited" is a marketing word, not a billing
strategy.

## Where the paywall does *not* fall, and why

- **Data export is free on every tier.** Portability is a right in several
  jurisdictions and a promise in `MISSION.md` ("user owns their data"). Charging
  for the exit is the kind of decision that shows up in reviews.
- **Account deletion, MFA, and every security control are free.** Charging for
  safety is indefensible in a finance product.
- **Budgets and goals are free.** They are table stakes in this category; gating
  them would make the free tier fail its one job.
- **Notifications are free.** They drive the daily-open habit the mission is
  built around, and a habit is worth more than the upsell.

## Enforcement, and the switch that turns it on

Gates are **inert on any deployment with no payment provider configured**.
Nobody is ever refused a feature for not paying on an instance where paying is
impossible — that would be a dead end, and it is the state of every developer
checkout, CI run, and self-hosted instance.

So **configuring Stripe is what switches pricing on.** There is no second flag to
forget. `GET /billing/subscription` reports `gatesEnforced`, and the app shows
"Everything is available" rather than a tier comparison nobody can act on.

One thing to settle before charging from the phone: purchasing in the mobile app
is behind `BILLING_PURCHASE_MODE`, which defaults to `informational` because
Apple and Google require their own billing for digital subscriptions. Turning on
gates while the app cannot sell would show users a paywall they cannot pay
through. See [ADR-0007](adr/0007-billing-and-entitlements.md) §6.6.

## Stripe setup

Two recurring prices on one product, then four environment variables.

1. **Products → Add product**, name it `FINVERSE Pro`.
2. Add two recurring prices: `$8.99` monthly and `$79.00` yearly. Copy both
   price ids.
3. **Developers → Webhooks**, add an endpoint at
   `https://your-host/api/billing-webhooks/stripe`, subscribed to
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, and `customer.subscription.resumed`.
   Copy the signing secret.
4. **Settings → Tax** — enable Stripe Tax and register in the jurisdictions you
   owe. Registration is a filing obligation, not a checkbox.
5. **Settings → Billing → Customer portal** — enable cancellation and payment-
   method updates. The app links here rather than rebuilding those flows.

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_PRICE_ID_PRO_ANNUAL=price_...
BILLING_TRIAL_DAYS=14
```

Locally, `stripe listen --forward-to localhost:3000/api/billing-webhooks/stripe`
prints a signing secret for development.

## Changing any of this

| Change | Where |
|---|---|
| Prices, the annual discount, the currency | Stripe dashboard. Deliberately not in the codebase — a second copy of what customers are charged eventually disagrees with the one taking the money |
| Trial length | `BILLING_TRIAL_DAYS`. `0` disables it |
| Which features are paid | `entitlements` in `apps/api/src/domain/billing/plans.ts`, then a `@RequiresEntitlement(...)` decorator on the route |
| Free-tier connection limit | `bankLinkLimit` in the same file |
| Adding a tier | Same file, plus a price id. `PlanId` is a union, so the compiler finds every place that needs updating |
| Turning pricing off entirely | Unset `STRIPE_SECRET_KEY` |

`test/billing.spec.ts` pins the composition above under "plan composition", so
changing the model deliberately is one edit and changing it by accident fails a
test.

## Still outstanding

- **Sales tax registration** in each jurisdiction (§6.5 of
  [08-what-blocks-selling.md](08-what-blocks-selling.md)).
- **In-app purchase** via StoreKit / Play Billing, if you want to sell from
  inside the mobile app (§6.6).
- **Validation.** None of the above has been tested against a real customer. The
  first hundred users are worth more than any amount of reasoning here — the
  numbers to watch are trial-to-paid conversion, and what fraction of free users
  ever try to connect a second institution.
