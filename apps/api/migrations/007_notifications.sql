CREATE TABLE notification_preferences (
  user_id              text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  budget               boolean NOT NULL DEFAULT true,
  bills                boolean NOT NULL DEFAULT true,
  credit_utilization   boolean NOT NULL DEFAULT true,
  subscriptions        boolean NOT NULL DEFAULT true,
  low_balance          boolean NOT NULL DEFAULT true,
  unusual_transactions boolean NOT NULL DEFAULT true,
  bank_sync            boolean NOT NULL DEFAULT true,
  security             boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         text        NOT NULL,
  user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  title      text        NOT NULL,
  message    text        NOT NULL,
  severity   text        NOT NULL,
  dedupe_key text        NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL,

  PRIMARY KEY (user_id, id),
  CONSTRAINT notifications_kind_valid CHECK (
    kind IN ('budget', 'bill', 'credit_utilization', 'subscription', 'low_balance',
             'unusual_transaction', 'bank_sync', 'security')
  ),
  CONSTRAINT notifications_severity_valid CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT notifications_user_dedupe UNIQUE (user_id, dedupe_key)
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_user_isolation ON notification_preferences
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_user_isolation ON notifications
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
