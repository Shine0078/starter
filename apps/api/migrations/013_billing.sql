-- 013_billing — subscriptions and webhook de-duplication.
--
-- What is deliberately not here: any card detail. Checkout happens on the
-- provider's hosted page and this schema stores only opaque provider handles
-- plus the state needed to decide what a user is entitled to. Adding a PAN,
-- a last-four, or an expiry to this table drags the whole system into PCI DSS
-- scope — see docs/03-security-privacy.md, which argues for keeping it out.

CREATE TABLE subscriptions (
  user_id                  text        PRIMARY KEY
                                       REFERENCES users (id) ON DELETE CASCADE,
  plan                     text        NOT NULL DEFAULT 'free',
  status                   text        NOT NULL,
  provider                 text        NOT NULL DEFAULT 'stripe',
  provider_customer_id     text        NOT NULL,
  provider_subscription_id text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     NOT NULL DEFAULT false,
  trial_end                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_plan_valid CHECK (plan IN ('free', 'pro')),
  CONSTRAINT subscriptions_provider_valid CHECK (provider IN ('stripe')),
  CONSTRAINT subscriptions_status_valid CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  )),
  -- One customer handle maps to exactly one user. Two users sharing one would
  -- make every webhook ambiguous and could entitle the wrong account.
  CONSTRAINT subscriptions_customer_unique UNIQUE (provider, provider_customer_id),
  CONSTRAINT subscriptions_subscription_unique UNIQUE (provider, provider_subscription_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE  ROW LEVEL SECURITY;
CREATE POLICY subscriptions_user_isolation ON subscriptions
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- A billing webhook names a customer, not a FINVERSE user, and the runtime role
-- is under forced RLS — so it cannot look one up. This mirrors
-- finverse_link_owner in 008: a SECURITY DEFINER function that returns the one
-- opaque identifier needed to enter the correct user scope, and nothing else.
-- Plan, status, and period all stay behind the per-user policy.
CREATE OR REPLACE FUNCTION finverse_subscription_owner(customer_id text)
RETURNS TABLE (user_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT subs.user_id
  FROM public.subscriptions AS subs
  WHERE subs.provider = 'stripe' AND subs.provider_customer_id = customer_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION finverse_subscription_owner(text) FROM PUBLIC;

-- Delivered-event log, for idempotency.
--
-- Intentionally *not* user-scoped, and this is the same necessity that keeps
-- `users` and `sessions` outside RLS: the event has to be recorded as seen
-- before we know — or can know — which user it belongs to. An event naming an
-- unknown customer still must not be processed twice.
--
-- It holds no financial data: an opaque provider event id, its type, and when
-- it arrived.
CREATE TABLE billing_events (
  id          text        PRIMARY KEY,
  type        text        NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_received_idx ON billing_events (received_at);
