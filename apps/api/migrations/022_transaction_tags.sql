-- 022_transaction_tags — user-owned labels for a second organization axis.
-- Tags are persisted on the transaction row so exports stay portable and
-- provider syncs can preserve them without knowing about user metadata.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_tags_valid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_tags_valid CHECK (
    cardinality(tags) <= 20
  );

-- PostgreSQL CHECK constraints cannot contain subqueries. The API's pure
-- normalizer enforces per-label length/case/deduplication; this constraint
-- keeps direct SQL writes bounded by the same cardinality limit.

CREATE INDEX IF NOT EXISTS transactions_user_tags_gin_idx
  ON transactions USING gin (tags);
