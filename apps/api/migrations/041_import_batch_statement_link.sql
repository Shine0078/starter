-- Preserve provenance from approved ledger rows back to the reviewable source.
-- The source may be logically deleted after approval; the import record and
-- audit history remain, so this is intentionally nullable and non-cascading.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS statement_import_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'import_batches_statement_import_fk'
  ) THEN
    ALTER TABLE import_batches
      ADD CONSTRAINT import_batches_statement_import_fk
      FOREIGN KEY (user_id, statement_import_id)
      REFERENCES statement_imports(user_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS import_batches_statement_import_idx
  ON import_batches(user_id, statement_import_id)
  WHERE statement_import_id IS NOT NULL;
