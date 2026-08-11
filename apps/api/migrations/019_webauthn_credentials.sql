-- Passkey (WebAuthn) credentials. A passkey is a passwordless login factor, so
-- the public key and sign counter live per user under row-level security, are
-- exportable with the account, and are erased with it. The private key never
-- leaves the user's device.
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  user_id        text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id  text        NOT NULL,
  public_key_pem text        NOT NULL,
  counter        integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL,
  last_used_at   timestamptz,

  PRIMARY KEY (user_id, credential_id),
  CONSTRAINT webauthn_credentials_counter_valid CHECK (counter >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS webauthn_credentials_global_id_idx
  ON webauthn_credentials (credential_id);

ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webauthn_credentials_user_isolation ON webauthn_credentials;
CREATE POLICY webauthn_credentials_user_isolation ON webauthn_credentials
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
