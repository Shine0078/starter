-- 001_init — the Phase 0 schema.
--
-- Scoped to what the store ports actually need. The fuller model in
-- docs/02-data-model.md (institution links, subscriptions, goals, score
-- snapshots) arrives with the features that use it; migrating an empty table
-- is cheaper than maintaining one nothing writes to.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Identity is a Phase 1 concern. `id` is text rather than uuid because today's
-- ids come from a development header, not from a verified session. The
-- migration that introduces real auth changes this column type.
CREATE TABLE IF NOT EXISTS users (
  id         text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id              text        NOT NULL,
  user_id         text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            text        NOT NULL,
  type            text        NOT NULL,
  -- Last four digits only. A full account number must never reach this table.
  mask            text        NOT NULL,
  currency        char(3)     NOT NULL,
  -- Minor units. Negative on a credit card means money owed. See ADR-0003.
  balance_current bigint      NOT NULL,
  credit_limit    bigint,
  statement_day   smallint,
  payment_due_day smallint,
  updated_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT accounts_statement_day_valid
    CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  CONSTRAINT accounts_payment_due_day_valid
    CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                    text        NOT NULL,
  user_id               text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id            text        NOT NULL,
  -- The aggregator's own id. Half of the idempotency key.
  provider_txn_id       text        NOT NULL,
  -- A date, not a timestamp: a transaction posts on a day, and rendering a
  -- timestamp in a local timezone shifts some rows across month boundaries,
  -- which silently corrupts every monthly total.
  posted_at             date        NOT NULL,
  amount                bigint      NOT NULL,
  currency              char(3)     NOT NULL,
  raw_descriptor        text        NOT NULL,
  normalized_descriptor text        NOT NULL,
  merchant              text,
  category_slug         text        NOT NULL,
  category_source       text        NOT NULL,
  -- double precision, not real. Confidence is produced by float64 arithmetic in
  -- JS; float4 has ~7 significant digits, so a value like 0.9230769230769231
  -- comes back changed and any round-trip assertion on it fails.
  category_confidence   double precision NOT NULL,
  is_recurring          boolean     NOT NULL DEFAULT false,
  pending               boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT transactions_confidence_range
    CHECK (category_confidence >= 0 AND category_confidence <= 1),
  CONSTRAINT transactions_account_fk
    FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE
);

-- The index the entire sync path depends on. Aggregators re-send transactions
-- freely; without this, every sync duplicates history and every balance,
-- budget, and insight in the product is wrong.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_key
  ON transactions (user_id, account_id, provider_txn_id);

CREATE INDEX IF NOT EXISTS transactions_user_posted_idx
  ON transactions (user_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS transactions_user_category_idx
  ON transactions (user_id, category_slug, posted_at DESC);

-- Trigram index for descriptor search. A leading-wildcard LIKE cannot use a
-- btree index, and merchant search is exactly that shape.
CREATE INDEX IF NOT EXISTS transactions_descriptor_trgm_idx
  ON transactions USING gin (normalized_descriptor gin_trgm_ops);

CREATE TABLE IF NOT EXISTS budgets (
  id            text        NOT NULL,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_slug text        NOT NULL,
  -- Positive, minor units.
  limit_amount  bigint      NOT NULL,
  currency      char(3)     NOT NULL,
  period        text        NOT NULL,
  rollover      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT budgets_limit_positive CHECK (limit_amount > 0),
  CONSTRAINT budgets_period_valid CHECK (period IN ('weekly', 'monthly', 'yearly'))
);

-- One budget per category per user. Two budgets on Restaurants would each
-- report a different "remaining", and neither would be right.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_key
  ON budgets (user_id, category_slug);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id            text        NOT NULL,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  match_type    text        NOT NULL,
  pattern       text        NOT NULL,
  category_slug text        NOT NULL,
  priority      integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT rules_match_type_valid
    CHECK (match_type IN ('contains', 'exact', 'regex'))
);

CREATE INDEX IF NOT EXISTS rules_user_priority_idx
  ON categorization_rules (user_id, priority);
