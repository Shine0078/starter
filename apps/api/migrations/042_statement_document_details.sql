-- Keep only safe document-header metadata. Full account/card numbers and
-- addresses are never persisted; the selected FINVERSE account is authoritative.

ALTER TABLE statement_imports
  ADD COLUMN IF NOT EXISTS document_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE statement_imports
  DROP CONSTRAINT IF EXISTS statement_import_document_details_object;

ALTER TABLE statement_imports
  ADD CONSTRAINT statement_import_document_details_object
  CHECK (jsonb_typeof(document_details) = 'object');
