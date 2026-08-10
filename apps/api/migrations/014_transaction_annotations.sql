-- User-owned transaction context. Provider syncs must never erase these values.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS merchant_override text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS excluded_from_analytics boolean NOT NULL DEFAULT false;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_merchant_override_length;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_merchant_override_length
    CHECK (merchant_override IS NULL OR char_length(merchant_override) BETWEEN 1 AND 120);

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_note_length;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_note_length
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 2000);
