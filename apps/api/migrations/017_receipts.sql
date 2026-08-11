-- User-owned receipt records. Only extracted fields plus the raw text the
-- user explicitly shared are stored — never an image (MISSION1: receipt images
-- stay client-side; only extracted fields are uploaded).
CREATE TABLE IF NOT EXISTS receipts (
  id             text        PRIMARY KEY,
  user_id        text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  transaction_id text,
  merchant       text,
  receipt_date   date,
  total_minor    bigint,
  tax_minor      bigint,
  currency       char(3),
  items          text[]      NOT NULL DEFAULT '{}',
  text           text        NOT NULL,
  created_at     timestamptz NOT NULL,

  CONSTRAINT receipts_transaction_fk
    FOREIGN KEY (user_id, transaction_id)
    REFERENCES transactions (user_id, id) ON DELETE CASCADE,
  CONSTRAINT receipts_text_length CHECK (char_length(text) BETWEEN 1 AND 8000),
  CONSTRAINT receipts_merchant_length
    CHECK (merchant IS NULL OR char_length(merchant) BETWEEN 1 AND 160)
);

-- At most one receipt per transaction; NULL transaction rows (unattached
-- scans) remain unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS receipts_one_per_transaction
  ON receipts (user_id, transaction_id);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipts_user_isolation ON receipts;
CREATE POLICY receipts_user_isolation ON receipts
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
