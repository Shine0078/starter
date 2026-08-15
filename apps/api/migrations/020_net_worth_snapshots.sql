-- Currency-safe historical balance-sheet observations. A snapshot is replaced
-- when the same user synchronizes again on the same day, so provider balance
-- corrections do not create duplicate chart points.
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  user_id      text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recorded_on  date        NOT NULL,
  currency     char(3)     NOT NULL,
  assets       bigint      NOT NULL,
  debts        bigint      NOT NULL,
  net_position bigint      NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, recorded_on, currency),
  CONSTRAINT net_worth_assets_nonnegative CHECK (assets >= 0),
  CONSTRAINT net_worth_debts_nonnegative CHECK (debts >= 0),
  CONSTRAINT net_worth_arithmetic_valid CHECK (net_position = assets - debts)
);

CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_date_idx
  ON net_worth_snapshots (user_id, recorded_on DESC);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS net_worth_snapshots_user_isolation ON net_worth_snapshots;
CREATE POLICY net_worth_snapshots_user_isolation ON net_worth_snapshots
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
