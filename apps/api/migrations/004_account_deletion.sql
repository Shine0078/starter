ALTER TABLE users
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN purge_after timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_deletion_window_consistent CHECK (
    (status = 'pending_deletion' AND deletion_requested_at IS NOT NULL AND purge_after IS NOT NULL)
    OR
    (status <> 'pending_deletion' AND deletion_requested_at IS NULL AND purge_after IS NULL)
  );

CREATE INDEX users_due_for_purge_idx
  ON users (purge_after)
  WHERE status = 'pending_deletion';
