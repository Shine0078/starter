# ADR-0007: Billing runs on hosted checkout, and entitlement fails closed

**Status:** Accepted · **Date:** 2026-08-08

## Context

The product had no way to take money. Not a partial implementation — no pricing
model, no payment integration, no notion anywhere in the API of what a user had
paid for. That was the last substantial code gap between the repository and a
business (`08-what-blocks-selling.md`, §6).

Two things make billing unusually easy to get quietly wrong, and both are the
same shape as the financial bugs already recorded in `07-session-notes.md`:
nothing crashes, a number is just wrong. Either a paying customer silently loses
access, or someone who stopped paying silently keeps it.

## Decision

### 1. Card data never touches this system

Checkout and card management both happen on the provider's hosted pages. The API
creates a session and hands back a URL; it never sees a PAN, a CVC, or an expiry,
and `docs/03-security-privacy.md` already argues that keeping PCI DSS out of
scope is worth defending. This is where that argument is either honoured or lost.

The `Subscription` port has no card fields, and the `subscriptions` table has no
card columns. Both say so in a comment, because the pressure to add "just the
last four for the UI" will come, and the last four is enough to bring the
storage into scope.

### 2. Entitlement is derived, never stored as a boolean

`effectivePlan()` is a pure function of the stored subscription and the current
time, and every gate in the system routes through it. It fails closed in all
four ambiguous cases: no record, an unknown status, a lapsed period, and an
unrecognised price.

The asymmetry is deliberate. Failing closed costs a paying customer an upgrade
prompt, which they report within minutes. Failing open gives the product away
silently, and nobody reports that.

Two exceptions to strict closure, both intentional:

- **`past_due` stays entitled.** A failed renewal is usually an expired card,
  not a decision to leave. The provider's dunning retries for roughly two weeks
  before landing on `unpaid`, and cutting someone off from their own financial
  history on the first failed charge is hostile and bad business.
- **A 24-hour grace window past `currentPeriodEnd`.** Without it, every renewal
  flickers the customer down to free for the seconds between the charge and its
  webhook arriving.

### 3. Webhooks assume at-least-once and out-of-order

Both hazards are real and neither is exotic.

**Redelivery** is handled by an insert on a primary key in `billing_events`. The
insert *is* the lock — checking first and then inserting lets two concurrent
workers both pass the check.

**Ordering** is handled by not trusting the payload. On any subscription event
the current state is re-read from the provider, which is the only real source of
truth; the payload is the fallback when that read fails. Without this, a stale
`updated` arriving after a `deleted` resurrects a cancelled subscription.

`billing_events` deliberately carries no RLS policy, for the same necessity that
keeps `users` and `sessions` outside it (ADR-0006): the event must be recorded as
seen *before* we know which user it belongs to. It holds an opaque event id, a
type, and a timestamp — no financial data.

### 4. The client names a plan, never a price

`POST /billing/checkout-session` accepts a plan id from a server-side allowlist
and resolves the price from configuration. A client that could name a price
could name a cheaper one. This is the one endpoint where trusting the caller
costs real money.

### 5. Only the bank-link limit is enforced by default

The tiering in `domain/billing/plans.ts` is a **placeholder shape, not a product
decision**, and no feature route is gated today. Two reasons:

1. Pricing is the owner's decision (§6.1 of `08-what-blocks-selling.md`), and
   inventing one in code would bury it where nobody looks for it.
2. The Flutter client already calls `reports/monthly.pdf`,
   `cash-flow-forecast`, and `purchase-scenario` for every user. Gating any of
   them today would break the shipping app for everyone, with no upgrade path in
   the UI to recover through.

What *is* enforced is the connected-institution limit, because that is the one
genuine marginal cost — the aggregator charges per connected Item — and it fails
at connect time, which is exactly where an upgrade prompt belongs. The check runs
*before* the public-token exchange, so a refused connection never leaves an
orphaned Item pulling data we have no record of.

`EntitlementGuard` is wired up and tested. Turning a route into a paid feature is
one `@RequiresEntitlement(...)` decorator, once (1) and (2) are resolved.

## Consequences

**Good:** PCI scope stays out. Entitlement has one definition, in one pure
function, with the fail-closed rules applied everywhere at once. Adding a tier or
moving a capability between tiers is an edit to one file. Billing being absent is
a supported configuration that reports itself honestly rather than half-working.

**Bad:** an extra provider round-trip per subscription webhook, accepted because
these events are infrequent and correctness here is money. Cancellation, plan
changes, invoices, and card updates all live on the provider's portal rather than
in our UI — less control over that experience, in exchange for not rebuilding
four flows that are each a place to get billing wrong.

**Still open, and not solvable in code:** Apple and Google require their own
in-app purchase systems for digital subscriptions sold inside a mobile app, and
take a cut. The hosted-checkout flow built here is the **web** path. Wiring a
"Subscribe" button in the Flutter app to this endpoint would likely get the app
rejected from both stores. StoreKit and Play Billing are a separate integration
with their own receipt-validation webhooks, and `Subscription` is deliberately
provider-shaped so a second billing adapter can sit behind the same port.

## Alternatives rejected

- **Storing a `is_pro` boolean.** Cheap, and it goes stale the moment a webhook
  is missed, with nothing to detect that it has.
- **Trusting the webhook payload.** Simpler and wrong under out-of-order
  delivery, which providers explicitly do not guarantee against.
- **Building our own card form and subscription management.** Full control over
  the experience, in exchange for PCI DSS scope and reimplementing dunning. Not
  a trade worth making at any size, and least of all at this one.
- **Metering on transactions or accounts rather than institution links.** Both
  are cheap for us to store; the aggregator connection is the cost. Metering
  something that costs nothing is a tax on usage rather than a price for value.
