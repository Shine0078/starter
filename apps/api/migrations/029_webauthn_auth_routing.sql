-- 029_webauthn_auth_routing.sql
-- Pre-auth passkey login names a credential_id, not a FINVERSE user. The
-- runtime role is under forced RLS, so a direct table SELECT matches nothing.
-- This function returns only the owning user id so the store can re-enter
-- withUserScope and load verify material under ordinary policies.
--
-- Challenges are intentionally not user-scoped: the ceremony starts before a
-- user is known, the same way mfa_login_challenges does. The ceremony id is
-- stored only as a SHA-256 hash.

CREATE OR REPLACE FUNCTION finverse_webauthn_credential_owner(lookup_id text)
RETURNS TABLE (user_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT creds.user_id
  FROM public.webauthn_credentials AS creds
  WHERE creds.credential_id = lookup_id
    AND lookup_id IS NOT NULL
    AND char_length(lookup_id) BETWEEN 1 AND 512
  LIMIT 1
$$;

COMMENT ON FUNCTION finverse_webauthn_credential_owner(text) IS
  'Pre-auth passkey routing: one credential_id -> owning user id. Not a listing.';

REVOKE ALL ON FUNCTION finverse_webauthn_credential_owner(text) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  token_hash      text        PRIMARY KEY,
  challenge       text        NOT NULL,
  purpose         text        NOT NULL,
  user_id         text        REFERENCES users (id) ON DELETE CASCADE,
  email_attempted text,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  failed_attempts integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webauthn_challenges_purpose_valid CHECK (purpose IN ('register', 'login')),
  CONSTRAINT webauthn_challenges_failed_attempts_valid CHECK (failed_attempts BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_live_idx
  ON webauthn_challenges (expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE webauthn_challenges IS
  'Shared, expiring WebAuthn ceremonies. Hashed ids; consumed atomically; not RLS-scoped.';
