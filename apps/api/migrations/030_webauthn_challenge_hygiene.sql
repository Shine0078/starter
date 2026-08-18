-- 030_webauthn_challenge_hygiene.sql
-- Consume-once already stops replay, so failed_attempts was unused schema.
-- Grant the pre-auth routing function when the restricted runtime role exists.

ALTER TABLE webauthn_challenges DROP CONSTRAINT IF EXISTS webauthn_challenges_failed_attempts_valid;
ALTER TABLE webauthn_challenges DROP COLUMN IF EXISTS failed_attempts;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finverse_app') THEN
    GRANT EXECUTE ON FUNCTION public.finverse_webauthn_credential_owner(text) TO finverse_app;
  END IF;
END
$grant$;
