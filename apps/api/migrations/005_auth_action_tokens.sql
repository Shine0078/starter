CREATE TABLE auth_action_tokens (
  id         text        PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  token_hash text        NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT auth_action_tokens_kind_valid
    CHECK (kind IN ('verify_email', 'reset_password'))
);

CREATE INDEX auth_action_tokens_user_kind_idx
  ON auth_action_tokens (user_id, kind, created_at DESC);

CREATE INDEX auth_action_tokens_live_idx
  ON auth_action_tokens (expires_at)
  WHERE used_at IS NULL;
