-- 026_scheduled_transactions — obligations the user has declared.
--
-- Deliberately its own table rather than a flag on `transactions`. A schedule
-- is a commitment about the future; a transaction is a fact about the past.
-- Storing a future obligation as a transaction row would put money that has not
-- moved into every balance, budget and cash-flow total in the product.
--
-- Also distinct from the recurrence *detected* in the subscriptions engine.
-- Detection says "this looks like it repeats"; this table says "I committed to
-- this". Merging them means a detection error creates a commitment nobody made.

CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id            text        NOT NULL,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id    text        NOT NULL,
  name          text        NOT NULL,
  -- Minor units, signed. Negative is money leaving, as everywhere else.
  amount        bigint      NOT NULL,
  currency      char(3)     NOT NULL,
  category_slug text        NOT NULL,
  cadence       text        NOT NULL,
  start_date    date        NOT NULL,
  end_date      date,
  reminder_days integer     NOT NULL DEFAULT 3,
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,

  PRIMARY KEY (user_id, id),
  CONSTRAINT scheduled_transactions_account_fk
    FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE,
  CONSTRAINT scheduled_transactions_name_bounded
    CHECK (length(name) BETWEEN 1 AND 80),
  -- Zero is not a commitment.
  CONSTRAINT scheduled_transactions_amount_nonzero
    CHECK (amount <> 0),
  CONSTRAINT scheduled_transactions_cadence_valid
    CHECK (cadence IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  -- An end before the start yields a schedule with no occurrences at all.
  CONSTRAINT scheduled_transactions_dates_ordered
    CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT scheduled_transactions_reminder_bounded
    CHECK (reminder_days BETWEEN 0 AND 30)
);

CREATE INDEX IF NOT EXISTS scheduled_transactions_user_live_idx
  ON scheduled_transactions (user_id, start_date)
  WHERE archived_at IS NULL;

ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_transactions_user_isolation ON scheduled_transactions;
CREATE POLICY scheduled_transactions_user_isolation ON scheduled_transactions
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
