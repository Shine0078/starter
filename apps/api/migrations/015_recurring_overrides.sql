-- A user can correct the recurring detector for one transaction. NULL means
-- the value is derived from transaction history; a boolean is user-owned and
-- must survive every provider re-sync.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recurring_override boolean;
