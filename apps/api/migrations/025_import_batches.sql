-- 025_import_batches — provenance for manually imported transactions, and the
-- record that makes an import reversible.
--
-- Maybe's staged import is the pattern: an import is an event you can undo, not
-- an irreversible merge. Without a batch id on the row there is no way to
-- separate "the 300 rows I imported from a bad CSV" from everything else, and
-- the only remedy left is deleting transactions by hand.

CREATE TABLE IF NOT EXISTS import_batches (
  id             text        NOT NULL,
  user_id        text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id     text        NOT NULL,
  filename       text        NOT NULL,
  status         text        NOT NULL DEFAULT 'committed',
  rows_total     integer     NOT NULL,
  rows_imported  integer     NOT NULL,
  rows_duplicate integer     NOT NULL,
  rows_invalid   integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reverted_at    timestamptz,

  PRIMARY KEY (user_id, id),
  CONSTRAINT import_batches_account_fk
    FOREIGN KEY (user_id, account_id) REFERENCES accounts (user_id, id) ON DELETE CASCADE,
  CONSTRAINT import_batches_status_valid
    CHECK (status IN ('committed', 'reverted')),
  CONSTRAINT import_batches_counts_nonnegative
    CHECK (rows_total >= 0 AND rows_imported >= 0
           AND rows_duplicate >= 0 AND rows_invalid >= 0),
  CONSTRAINT import_batches_filename_bounded
    CHECK (length(filename) BETWEEN 1 AND 260)
);

CREATE INDEX IF NOT EXISTS import_batches_user_recent_idx
  ON import_batches (user_id, created_at DESC);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batches_user_isolation ON import_batches;
CREATE POLICY import_batches_user_isolation ON import_batches
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- Provenance on the transaction itself. Nullable: rows that came from a
-- provider sync have no batch, and that distinction is exactly what makes a
-- revert safe — it can only ever remove rows a user imported by hand.
--
-- No foreign key to import_batches. A revert deletes the transactions and marks
-- the batch reverted rather than deleting it, so the history of what was
-- imported and undone survives; an FK with ON DELETE CASCADE here would give
-- the opposite behaviour.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_batch_id text;

CREATE INDEX IF NOT EXISTS transactions_import_batch_idx
  ON transactions (user_id, import_batch_id)
  WHERE import_batch_id IS NOT NULL;
