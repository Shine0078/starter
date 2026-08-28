-- Durable statement analysis queue.
--
-- The encrypted source already lives on statement_imports, so a separate queue
-- table would duplicate sensitive routing state. The status and claim metadata
-- make the row itself the durable job. Workers claim through a narrow function;
-- they never receive a table-wide read permission outside that function.

ALTER TABLE statement_imports
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE statement_imports
  DROP CONSTRAINT IF EXISTS statement_import_status_valid;
ALTER TABLE statement_imports
  ADD CONSTRAINT statement_import_status_valid
  CHECK (status IN ('queued','processing','ready','approved','failed','deleted'));
ALTER TABLE statement_imports
  DROP CONSTRAINT IF EXISTS statement_import_attempts_valid;
ALTER TABLE statement_imports
  ADD CONSTRAINT statement_import_attempts_valid CHECK (attempts >= 0);

CREATE INDEX IF NOT EXISTS statement_import_queue_idx
  ON statement_imports(status, processing_started_at, created_at)
  WHERE status IN ('queued', 'processing');

-- Claiming is the only cross-user operation a runtime worker needs. It returns
-- opaque routing identifiers, never the encrypted document or extracted data.
CREATE OR REPLACE FUNCTION finverse_claim_statement_imports(batch_size integer)
RETURNS TABLE (
  id text,
  user_id text,
  account_id text,
  attempts integer
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH candidates AS (
    SELECT imports.id, imports.user_id
      FROM public.statement_imports AS imports
     WHERE imports.encrypted_source IS NOT NULL
       AND (
         imports.status = 'queued'
         OR (
           imports.status = 'processing'
           AND imports.processing_started_at < now() - interval '5 minutes'
         )
       )
     ORDER BY imports.created_at, imports.id
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(batch_size, 1), 25)
  )
  UPDATE public.statement_imports AS imports
     SET status = 'processing',
         attempts = imports.attempts + 1,
         processing_started_at = now(),
         error = NULL
    FROM candidates
   WHERE imports.id = candidates.id
     AND imports.user_id = candidates.user_id
  RETURNING imports.id, imports.user_id, imports.account_id, imports.attempts
$$;

REVOKE ALL ON FUNCTION finverse_claim_statement_imports(integer) FROM PUBLIC;
