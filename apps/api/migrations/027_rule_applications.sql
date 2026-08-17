-- 027_rule_applications — bulk recategorization that can be undone.
--
-- Applying a rule across a ledger rewrites history at scale, and the person who
-- wrote the pattern is usually the one least able to predict its reach. A
-- dry-run helps, but the honest complement is an undo: the previous category of
-- every changed row is recorded so the whole operation can be reversed exactly.
--
-- Storing only "which rows changed" would not be enough. Reverting needs to know
-- what each row was *before*, and that is not recoverable from the rule.

CREATE TABLE IF NOT EXISTS rule_applications (
  id            text        NOT NULL,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pattern       text        NOT NULL,
  match_type    text        NOT NULL,
  category_slug text        NOT NULL,
  rows_changed  integer     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reverted_at   timestamptz,

  PRIMARY KEY (user_id, id),
  CONSTRAINT rule_applications_match_type_valid
    CHECK (match_type IN ('contains', 'exact', 'regex')),
  CONSTRAINT rule_applications_rows_nonnegative
    CHECK (rows_changed >= 0)
);

-- The before-state of each changed row.
CREATE TABLE IF NOT EXISTS rule_application_changes (
  application_id           text NOT NULL,
  user_id                  text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  transaction_id           text NOT NULL,
  previous_category_slug   text NOT NULL,
  previous_category_source text NOT NULL,
  previous_confidence      double precision NOT NULL,

  PRIMARY KEY (user_id, application_id, transaction_id),
  CONSTRAINT rule_application_changes_application_fk
    FOREIGN KEY (user_id, application_id)
    REFERENCES rule_applications (user_id, id) ON DELETE CASCADE,
  -- Cascades with the transaction: a row that no longer exists cannot be
  -- restored, and keeping the change record would make a revert report a
  -- restoration that never happened.
  CONSTRAINT rule_application_changes_transaction_fk
    FOREIGN KEY (user_id, transaction_id)
    REFERENCES transactions (user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rule_applications_user_recent_idx
  ON rule_applications (user_id, created_at DESC);

ALTER TABLE rule_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE rule_application_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_application_changes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rule_applications_user_isolation ON rule_applications;
CREATE POLICY rule_applications_user_isolation ON rule_applications
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

DROP POLICY IF EXISTS rule_application_changes_user_isolation ON rule_application_changes;
CREATE POLICY rule_application_changes_user_isolation ON rule_application_changes
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
