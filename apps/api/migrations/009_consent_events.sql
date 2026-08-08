CREATE TABLE consent_events (
  id             text        PRIMARY KEY,
  user_id        text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind           text        NOT NULL,
  granted        boolean     NOT NULL,
  policy_version text        NOT NULL,
  source         text        NOT NULL,
  created_at     timestamptz NOT NULL,

  CONSTRAINT consent_events_kind_valid CHECK (
    kind IN ('analytics', 'product_updates', 'terms', 'privacy_notice')
  ),
  CONSTRAINT consent_events_source_valid CHECK (
    source IN ('registration', 'user_settings', 'admin_migration')
  )
);

CREATE INDEX consent_events_user_kind_recent_idx
  ON consent_events (user_id, kind, created_at DESC, id DESC);

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_events_user_isolation ON consent_events
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
