-- 028_fx_rates — dated exchange rates, with a stated source.
--
-- FINVERSE has refused to combine currencies since ADR-0003, and that refusal
-- was right while there was no rate to combine them with. The cost was that a
-- user holding two currencies never saw a single net-worth figure.
--
-- This table removes the refusal without removing the honesty. A conversion
-- happens only against a rate that has a date and a source, and both travel
-- with every converted total. An undated or invented rate is still unacceptable.

CREATE TABLE IF NOT EXISTS fx_rates (
  id         text        NOT NULL,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  base       char(3)     NOT NULL,
  quote      char(3)     NOT NULL,
  -- double precision, not bigint. A rate is a ratio with no minor unit, and
  -- forcing it into integers needs an arbitrary scale factor that then leaks
  -- into every comparison. Amounts stay integers; only the multiplier is a
  -- float, and the product is rounded back to minor units immediately.
  rate       double precision NOT NULL,
  as_of      date        NOT NULL,
  source     text        NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT fx_rates_positive CHECK (rate > 0),
  -- A self-rate is either 1 and pointless, or not 1 and wrong.
  CONSTRAINT fx_rates_pair_distinct CHECK (base <> quote),
  CONSTRAINT fx_rates_source_valid
    CHECK (source IN ('manual', 'provider', 'statement')),
  CONSTRAINT fx_rates_note_bounded CHECK (note IS NULL OR length(note) <= 200)
);

-- One rate per pair per day. A second rate for the same day is a correction,
-- not a second truth, so it replaces rather than making the lookup ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS fx_rates_pair_day_key
  ON fx_rates (user_id, base, quote, as_of);

-- Lookup walks backwards from a date for a pair, so the index leads with both.
CREATE INDEX IF NOT EXISTS fx_rates_pair_recent_idx
  ON fx_rates (user_id, base, quote, as_of DESC);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_rates_user_isolation ON fx_rates;
CREATE POLICY fx_rates_user_isolation ON fx_rates
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
