-- 033_split_authorization_hardening — close direct RLS writes that bypass the
-- service's group-admin and payer-authority checks.

CREATE OR REPLACE FUNCTION finverse_is_split_admin(gid text) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (
    SELECT 1
      FROM split_group_members m
     WHERE m.group_id = gid
       AND m.user_id = finverse_current_user_id()
       AND m.role = 'admin'
  ) $$;

CREATE OR REPLACE FUNCTION finverse_is_split_creator(gid text) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (
    SELECT 1
      FROM split_groups g
     WHERE g.id = gid
       AND g.created_by = finverse_current_user_id()
  ) $$;

REVOKE ALL ON FUNCTION finverse_is_split_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finverse_is_split_creator(text) FROM PUBLIC;

DROP POLICY split_group_members_member_access ON split_group_members;
CREATE POLICY split_group_members_member_access ON split_group_members
  USING (user_id = finverse_current_user_id() OR finverse_is_split_member(group_id))
  WITH CHECK (
    finverse_is_split_admin(group_id)
    OR (
      user_id = finverse_current_user_id()
      AND finverse_is_split_creator(group_id)
    )
  );

CREATE OR REPLACE FUNCTION finverse_validate_split_expense_actor()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.paid_by_user_id <> finverse_current_user_id() THEN
    RAISE EXCEPTION 'split expense payer must be the authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS split_expenses_actor_guard ON split_expenses;
CREATE TRIGGER split_expenses_actor_guard
  BEFORE INSERT OR UPDATE OF paid_by_user_id ON split_expenses
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_expense_actor();
