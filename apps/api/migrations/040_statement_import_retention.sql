-- Bound sensitive source retention and durable queue growth.
--
-- Source files are encrypted before they reach this table, but ciphertext is
-- still sensitive and still consumes database/back-up capacity. A source is
-- available long enough for review (90 days), then the claim function removes
-- it and records the deletion. The approved rows and audit trail remain.

ALTER TABLE statement_imports
  ADD COLUMN IF NOT EXISTS source_expires_at timestamptz;

UPDATE statement_imports
   SET source_expires_at = created_at + interval '90 days'
 WHERE encrypted_source IS NOT NULL
   AND source_expires_at IS NULL;

ALTER TABLE statement_imports
  DROP CONSTRAINT IF EXISTS statement_import_source_expiry_valid;
ALTER TABLE statement_imports
  ADD CONSTRAINT statement_import_source_expiry_valid
  CHECK (source_expires_at IS NULL OR source_expires_at >= created_at);

CREATE INDEX IF NOT EXISTS statement_import_source_expiry_idx
  ON statement_imports(source_expires_at)
  WHERE encrypted_source IS NOT NULL;

CREATE OR REPLACE FUNCTION finverse_claim_statement_imports(batch_size integer)
RETURNS TABLE (
  id text,
  user_id text,
  account_id text,
  attempts integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Expired documents and jobs that have exhausted their retry budget are
  -- destroyed before claiming new work. This also leaves an audit record for
  -- the automatic source deletion without exposing the source to the worker.
  WITH expired AS (
    UPDATE public.statement_imports AS imports
       SET encrypted_source = NULL,
           source_deleted_at = COALESCE(imports.source_deleted_at, now()),
           status = CASE WHEN imports.status IN ('queued', 'processing') THEN 'failed' ELSE imports.status END,
           error = CASE WHEN imports.status IN ('queued', 'processing') THEN 'The encrypted source retention period expired.' ELSE imports.error END,
           processing_started_at = NULL
     WHERE imports.encrypted_source IS NOT NULL
       AND imports.source_expires_at IS NOT NULL
       AND imports.source_expires_at <= now()
     RETURNING imports.user_id, imports.id
  )
  INSERT INTO public.statement_import_events (id, user_id, import_id, row_id, kind, detail, created_at)
  SELECT 'evt_source_expired_' || expired.id, expired.user_id, expired.id, NULL,
         'source_deleted', jsonb_build_object('reason', 'retention_expired'), now()
    FROM expired
  ON CONFLICT ON CONSTRAINT statement_import_events_pkey DO NOTHING;

  WITH exhausted AS (
    UPDATE public.statement_imports AS imports
       SET status = 'failed',
           error = 'The statement job exceeded the retry limit.',
           encrypted_source = NULL,
           source_deleted_at = COALESCE(imports.source_deleted_at, now()),
           processing_started_at = NULL
     WHERE imports.status = 'processing'
       AND imports.attempts >= 3
       AND imports.encrypted_source IS NOT NULL
       AND (imports.processing_started_at IS NULL OR imports.processing_started_at < now() - interval '5 minutes')
     RETURNING imports.user_id, imports.id
  )
  INSERT INTO public.statement_import_events (id, user_id, import_id, row_id, kind, detail, created_at)
  SELECT 'evt_retry_exhausted_' || exhausted.id, exhausted.user_id, exhausted.id, NULL,
         'failed', jsonb_build_object('reason', 'retry_limit'), now()
    FROM exhausted
  ON CONFLICT ON CONSTRAINT statement_import_events_pkey DO NOTHING;

  RETURN QUERY
  WITH candidates AS (
    SELECT imports.id, imports.user_id
      FROM public.statement_imports AS imports
     WHERE imports.encrypted_source IS NOT NULL
       AND imports.attempts < 3
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
  RETURNING imports.id, imports.user_id, imports.account_id, imports.attempts;
END;
$$;

REVOKE ALL ON FUNCTION finverse_claim_statement_imports(integer) FROM PUBLIC;
