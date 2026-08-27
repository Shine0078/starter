-- Durable, review-first manual statement imports.
-- Original files are encrypted by the API before they reach this table and can
-- be removed independently after processing. Every table is user-scoped and
-- forced through RLS, including audit records and staged rows.

CREATE TABLE IF NOT EXISTS statement_imports (
  id                  text        NOT NULL,
  user_id             text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id          text        NOT NULL,
  filename            text        NOT NULL,
  mime_type           text        NOT NULL,
  format              text        NOT NULL,
  statement_hash      text        NOT NULL,
  status              text        NOT NULL DEFAULT 'ready',
  rows_total          integer     NOT NULL,
  rows_included       integer     NOT NULL,
  rows_excluded       integer     NOT NULL,
  rows_needs_review   integer     NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz,
  approved_at         timestamptz,
  source_deleted_at   timestamptz,
  encrypted_source    text,
  error               text,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE,
  CONSTRAINT statement_import_status_valid CHECK (status IN ('ready','approved','failed','deleted')),
  CONSTRAINT statement_import_format_valid CHECK (format IN ('csv','xlsx','pdf','image')),
  CONSTRAINT statement_import_hash_valid CHECK (statement_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT statement_import_filename_bounded CHECK (length(filename) BETWEEN 1 AND 260),
  CONSTRAINT statement_import_counts_valid CHECK (rows_total >= 0 AND rows_included >= 0 AND rows_excluded >= 0 AND rows_needs_review >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS statement_import_identity_key
  ON statement_imports(user_id, account_id, statement_hash)
  WHERE status <> 'deleted';
CREATE INDEX IF NOT EXISTS statement_import_recent_idx
  ON statement_imports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS statement_import_rows (
  id                  text        NOT NULL,
  import_id           text        NOT NULL,
  user_id             text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_line         integer     NOT NULL,
  posted_at           date,
  description         text        NOT NULL,
  merchant            text,
  amount              bigint,
  currency            char(3)     NOT NULL,
  direction           text        NOT NULL,
  category_slug       text        NOT NULL,
  category_source     text        NOT NULL,
  category_confidence double precision NOT NULL,
  is_recurring        boolean     NOT NULL DEFAULT false,
  flags               text[]      NOT NULL DEFAULT '{}',
  decision            text        NOT NULL,
  fingerprint         text        NOT NULL,
  raw                 text        NOT NULL,
  edited_at           timestamptz,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, import_id) REFERENCES statement_imports(user_id, id) ON DELETE CASCADE,
  CONSTRAINT statement_import_row_line_valid CHECK (source_line > 0),
  CONSTRAINT statement_import_row_direction_valid CHECK (direction IN ('debit','credit','unknown')),
  CONSTRAINT statement_import_row_decision_valid CHECK (decision IN ('include','exclude','needs_review')),
  CONSTRAINT statement_import_row_confidence_valid CHECK (category_confidence >= 0 AND category_confidence <= 1),
  CONSTRAINT statement_import_row_fingerprint_valid CHECK (fingerprint ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS statement_import_rows_parent_idx
  ON statement_import_rows(user_id, import_id, source_line);
-- Fingerprints identify a row across re-imports, but are not unique inside one
-- statement: two real purchases can have identical date/amount/description.

CREATE TABLE IF NOT EXISTS statement_import_events (
  id          text        NOT NULL,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  import_id   text        NOT NULL,
  row_id      text,
  kind        text        NOT NULL,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, import_id) REFERENCES statement_imports(user_id, id) ON DELETE CASCADE,
  CONSTRAINT statement_import_event_kind_valid CHECK (kind IN ('created','processed','row_edited','row_split','rows_merged','approved','source_deleted','deleted','failed'))
);
CREATE INDEX IF NOT EXISTS statement_import_events_parent_idx
  ON statement_import_events(user_id, import_id, created_at, id);

ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE statement_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_import_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE statement_import_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_import_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statement_imports_user_isolation ON statement_imports;
CREATE POLICY statement_imports_user_isolation ON statement_imports
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
DROP POLICY IF EXISTS statement_import_rows_user_isolation ON statement_import_rows;
CREATE POLICY statement_import_rows_user_isolation ON statement_import_rows
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
DROP POLICY IF EXISTS statement_import_events_user_isolation ON statement_import_events;
CREATE POLICY statement_import_events_user_isolation ON statement_import_events
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
