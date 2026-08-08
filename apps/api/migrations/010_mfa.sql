CREATE TABLE user_mfa (
  user_id          text        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  encrypted_secret text        NOT NULL,
  enabled_at       timestamptz,
  last_used_step   bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mfa_recovery_codes (
  user_id   text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash text        NOT NULL,
  used_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE mfa_login_challenges (
  token_hash text        PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mfa_login_challenges_live_idx ON mfa_login_challenges (expires_at) WHERE used_at IS NULL;

-- These tables are intentionally not RLS-scoped: login must read them before
-- an authenticated user context exists. Opaque identifiers, hashed codes, and
-- adapter queries provide the boundary; the runtime role receives table grants.
