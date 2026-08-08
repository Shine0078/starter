ALTER TABLE accounts
  ADD COLUMN source text NOT NULL DEFAULT 'provider';

ALTER TABLE accounts
  ADD CONSTRAINT accounts_source_valid
  CHECK (source IN ('provider', 'manual'));

COMMENT ON COLUMN accounts.source IS
  'Provenance boundary: only manual rows may be changed through manual-account endpoints.';
