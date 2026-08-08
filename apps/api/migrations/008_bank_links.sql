CREATE TABLE institution_links (
  id                       text        NOT NULL,
  user_id                  text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider                 text        NOT NULL,
  provider_item_id         text        NOT NULL,
  institution_id           text,
  institution_name         text        NOT NULL,
  encrypted_access_token   text        NOT NULL,
  cursor                   text,
  status                   text        NOT NULL,
  error_code               text,
  last_synced_at           timestamptz,
  created_at               timestamptz NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT institution_links_provider_valid CHECK (provider IN ('plaid')),
  CONSTRAINT institution_links_status_valid
    CHECK (status IN ('healthy', 'syncing', 'needs_reauth', 'error', 'revoked')),
  CONSTRAINT institution_links_provider_item_unique UNIQUE (provider, provider_item_id)
);

CREATE INDEX institution_links_user_status_idx ON institution_links (user_id, status);

ALTER TABLE institution_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_links FORCE ROW LEVEL SECURITY;
CREATE POLICY institution_links_user_isolation ON institution_links
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- Plaid webhooks contain an Item ID but no FINVERSE user ID. Runtime database
-- connections are subject to forced RLS, so expose only the two opaque routing
-- identifiers needed to enter the correct user scope. The access token and all
-- financial fields remain behind the per-user policy.
CREATE OR REPLACE FUNCTION finverse_link_owner(item_id text)
RETURNS TABLE (user_id text, link_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT links.user_id, links.id
  FROM public.institution_links AS links
  WHERE links.provider = 'plaid' AND links.provider_item_id = item_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION finverse_link_owner(text) FROM PUBLIC;

CREATE TABLE bank_webhook_jobs (
  id            text        PRIMARY KEY,
  user_id       text        NOT NULL,
  link_id       text        NOT NULL,
  body_hash     text        NOT NULL,
  dedupe_bucket timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  status        text        NOT NULL DEFAULT 'pending',
  attempts      integer     NOT NULL DEFAULT 0,
  available_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (user_id, link_id)
    REFERENCES institution_links (user_id, id) ON DELETE CASCADE,
  CONSTRAINT bank_webhook_jobs_status_valid
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT bank_webhook_jobs_attempts_valid CHECK (attempts >= 0),
  CONSTRAINT bank_webhook_jobs_delivery_unique UNIQUE (body_hash, dedupe_bucket)
);

CREATE INDEX bank_webhook_jobs_due_idx
  ON bank_webhook_jobs (status, available_at, created_at);

ALTER TABLE bank_webhook_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_webhook_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_webhook_jobs_user_isolation ON bank_webhook_jobs
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- Workers must recover pending jobs after process restarts, but should not gain
-- unrestricted table access around RLS. This function atomically claims work
-- and returns only opaque routing identifiers, never tokens or financial data.
CREATE OR REPLACE FUNCTION finverse_claim_bank_webhooks(batch_size integer)
RETURNS TABLE (
  id text,
  user_id text,
  link_id text,
  body_hash text,
  attempts integer,
  available_at timestamptz
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH candidates AS (
    SELECT jobs.id
    FROM public.bank_webhook_jobs AS jobs
    WHERE (
      jobs.status = 'pending' AND jobs.available_at <= now()
    ) OR (
      jobs.status = 'processing' AND jobs.updated_at < now() - interval '5 minutes'
    )
    ORDER BY jobs.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(batch_size, 1), 100)
  )
  UPDATE public.bank_webhook_jobs AS jobs
  SET status = 'processing', attempts = jobs.attempts + 1, updated_at = now()
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.id, jobs.user_id, jobs.link_id, jobs.body_hash,
            jobs.attempts, jobs.available_at
$$;

REVOKE ALL ON FUNCTION finverse_claim_bank_webhooks(integer) FROM PUBLIC;
