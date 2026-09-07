-- Encrypt staged statement descriptions, merchants, and raw source lines.
-- Amount/date/category fields remain queryable for review counts and duplicate
-- checks; the user-visible text is authenticated ciphertext decrypted only by
-- the application runtime.

ALTER TABLE statement_import_rows
  ADD COLUMN IF NOT EXISTS encrypted_fields text;

ALTER TABLE statement_import_rows
  DROP CONSTRAINT IF EXISTS statement_import_row_encrypted_fields_valid;

ALTER TABLE statement_import_rows
  ADD CONSTRAINT statement_import_row_encrypted_fields_valid
  CHECK (encrypted_fields IS NULL OR encrypted_fields LIKE 'v1.%');

CREATE INDEX IF NOT EXISTS statement_import_rows_encrypted_idx
  ON statement_import_rows(user_id, import_id)
  WHERE encrypted_fields IS NOT NULL;
