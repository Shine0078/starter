-- Remote push device registrations. Holds only an opaque provider token —
-- never a message, never bank data. A device that revokes push unregisters
-- here, and account erasure removes every row.
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id      text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token        text        NOT NULL,
  platform     text        NOT NULL,
  created_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,

  PRIMARY KEY (user_id, token),
  CONSTRAINT push_tokens_platform_valid
    CHECK (platform IN ('android', 'ios', 'web')),
  CONSTRAINT push_tokens_token_length
    CHECK (char_length(token) BETWEEN 20 AND 512)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_user_isolation ON push_tokens;
CREATE POLICY push_tokens_user_isolation ON push_tokens
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
