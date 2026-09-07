-- A failed analysis is not a committed import. Let the owner retry the same
-- document after correcting an account or file problem without weakening
-- duplicate protection for ready or approved statements.
DROP INDEX IF EXISTS statement_import_identity_key;
CREATE UNIQUE INDEX statement_import_identity_key
  ON statement_imports(user_id, account_id, statement_hash)
  WHERE status NOT IN ('deleted', 'failed');
