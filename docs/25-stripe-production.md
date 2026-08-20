# Stripe live-mode checklist

Engineering preparation for production billing. Hosted checkout, portal,
signed webhooks, RLS-backed subscriptions, and fail-closed entitlements are
implemented. This is not live billing.

## Code already in the repository

- Production refuses Stripe test keys
- Webhook signature verification on the raw body
- Idempotent event handling
- Entitlements fail closed when billing is configured

## Owner / Stripe actions

1. Complete Stripe live account, tax, and payout setup.
2. Store live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the secret manager.
3. Point webhook and success/cancel URLs at the canonical Cloud Run origin.
4. Confirm pricing, dunning, refunds, and support process.
5. Do not enable registration for paying customers while legal URLs are
   technical-beta documents.

## Verification

- A signed test event is accepted once and ignored on replay.
- A missing or invalid signature is rejected.
- Entitlement checks fail closed if the webhook never arrived.
