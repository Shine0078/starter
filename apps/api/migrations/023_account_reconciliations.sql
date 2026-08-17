-- 023_account_reconciliations — auditable evidence about what an account
-- actually held on a date.
--
-- A reconciliation never edits a transaction. It records the user's observation
-- alongside what FINVERSE derived, and preserves the difference between them.
-- An app that quietly inserts a balancing entry to make the numbers agree
-- destroys the exact discrepancy the user needed to see.

CREATE TABLE IF NOT EXISTS account_reconciliations (
  id                text        NOT NULL,
  user_id           text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id        text        NOT NULL,
  statement_date    date        NOT NULL,
  -- Minor units, signed. Negative on a credit card means money owed.
  observed_balance  bigint      NOT NULL,
  currency          char(3)     NOT NULL,
  -- Frozen at assertion time. Recomputing it later would silently rewrite
  -- history as new transactions arrive, and the whole value of the record is
  -- that it says what we believed *then*.
  computed_balance  bigint      NOT NULL,
  difference        bigint      NOT NULL,
  source            text        NOT NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Withdrawn rather than deleted: an audit trail you can erase is not one.
  archived_at       timestamptz,

  PRIMARY KEY (user_id, id),
  CONSTRAINT account_reconciliations_account_fk
    FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE,
  CONSTRAINT account_reconciliations_arithmetic_valid
    CHECK (difference = observed_balance - computed_balance),
  CONSTRAINT account_reconciliations_source_valid
    CHECK (source IN ('statement', 'bank_app', 'atm_receipt', 'manual_count', 'other')),
  CONSTRAINT account_reconciliations_note_bounded
    CHECK (note IS NULL OR length(note) <= 500)
);

-- One live assertion per account per date. A second observation for the same
-- closing date is a correction, not a new fact, so it replaces rather than
-- accumulating two contradictory records. Archived rows are excluded so a
-- withdrawn assertion does not block re-asserting the same date.
CREATE UNIQUE INDEX IF NOT EXISTS account_reconciliations_live_date_key
  ON account_reconciliations (user_id, account_id, statement_date)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS account_reconciliations_user_recent_idx
  ON account_reconciliations (user_id, statement_date DESC);

ALTER TABLE account_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_reconciliations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_reconciliations_user_isolation ON account_reconciliations;
CREATE POLICY account_reconciliations_user_isolation ON account_reconciliations
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
