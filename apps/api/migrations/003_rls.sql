-- 003_rls — the database refuses to serve another user's rows.
--
-- Until now isolation was entirely an application property: every store method
-- takes a userId and every statement filters on it. That holds right up until
-- one query is written without the filter, and the failure mode is silent — the
-- endpoint returns 200 with somebody else's transactions in it.
--
-- These policies make the wrong rows unreachable rather than merely unasked
-- for. Each request opens a transaction, pins `finverse.user_id`, and the
-- planner appends the predicate whether or not the query remembered to.
--
-- Three things this depends on, all of which fail *open* and silently if
-- skipped, so they are worth stating:
--
--   1. The connection must not be a superuser and must not hold BYPASSRLS.
--      Those bypass every policy here without an error. The runtime role is
--      created by src/infra/postgres/app-role.ts; DATABASE_APP_URL points at it.
--   2. FORCE is set as well as ENABLE, so the table *owner* is subject to the
--      policies too. Without it, anything connecting as the owner — the
--      migration user, a psql session, the test harness — sees everything, and
--      a test "proving" isolation proves nothing.
--   3. Only tables with a user_id qualify. `users`, `sessions` and `auth_events`
--      are read before a user is known (login, refresh, lockout counting), so
--      they cannot be scoped to one and stay under application control.

-- The policy predicate, named once. `nullif` matters: an unset GUC yields NULL
-- and a blank one yields '', and only the first of those compares as "no rows"
-- on its own. Both must, or a connection that never set the scope would match
-- any row whose user_id happened to be empty.
CREATE OR REPLACE FUNCTION finverse_current_user_id() RETURNS text
  LANGUAGE sql
  STABLE
  AS $$ SELECT nullif(current_setting('finverse.user_id', true), '') $$;

COMMENT ON FUNCTION finverse_current_user_id() IS
  'The user pinned by withUserScope() for the current transaction. NULL outside one.';

-- Belt and braces on PostgreSQL < 15, where PUBLIC could still create objects in
-- `public`. A role able to create there could shadow the function above with one
-- of its own and defeat every policy below.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ---------------------------------------------------------------- accounts

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_user_isolation ON accounts;
CREATE POLICY accounts_user_isolation ON accounts
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- ------------------------------------------------------------ transactions

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_user_isolation ON transactions;
CREATE POLICY transactions_user_isolation ON transactions
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- ----------------------------------------------------------------- budgets

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgets_user_isolation ON budgets;
CREATE POLICY budgets_user_isolation ON budgets
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

-- ------------------------------------------------------- categorization_rules

ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorization_rules FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorization_rules_user_isolation ON categorization_rules;
CREATE POLICY categorization_rules_user_isolation ON categorization_rules
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
