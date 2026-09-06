-- 039_split_member_removal - balance-safe leave/remove command.

-- Financial writes and member removal serialize on the same group row. Without
-- this lock, a removal could validate a zero balance while a concurrent expense
-- is still being inserted for the departing member.
CREATE OR REPLACE FUNCTION finverse_validate_split_financial_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  archived timestamptz;
BEGIN
  SELECT g.archived_at INTO archived
    FROM split_groups g
   WHERE g.id = NEW.group_id
   FOR UPDATE;
  IF archived IS NOT NULL THEN
    RAISE EXCEPTION 'archived split groups are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finverse_validate_split_invitation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Cascading account deletion is owner-side maintenance.
  IF finverse_current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.group_id <> OLD.group_id
     OR NEW.invitee_user_id <> OLD.invitee_user_id
     OR (NEW.invited_by_user_id IS NOT NULL
         AND NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id)
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'split invitation identity is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IN ('left', 'removed') THEN
    IF OLD.status <> 'accepted'
       OR current_setting('finverse.split_departure', true) <> '1' THEN
      RAISE EXCEPTION 'invalid split invitation departure'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' OR NEW.decided_at IS NULL THEN
    RAISE EXCEPTION 'split invitation is no longer pending'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW.status = 'revoked' THEN
    IF NOT finverse_is_split_admin(OLD.group_id) THEN
      RAISE EXCEPTION 'only a group administrator can revoke an invitation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.status IN ('accepted', 'declined') THEN
    IF NEW.invitee_user_id <> finverse_current_user_id() THEN
      RAISE EXCEPTION 'only the invited user can decide an invitation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid split invitation transition'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finverse_mark_split_member_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_status text;
BEGIN
  IF finverse_current_user_id() IS NULL THEN
    RETURN OLD;
  END IF;
  next_status := CASE
    WHEN OLD.user_id = finverse_current_user_id() THEN 'left'
    ELSE 'removed'
  END;
  PERFORM set_config('finverse.split_departure', '1', true);
  UPDATE split_group_invitations
     SET status = next_status, decided_at = now()
   WHERE group_id = OLD.group_id
     AND invitee_user_id = OLD.user_id
     AND status = 'accepted';
  PERFORM set_config('finverse.split_departure', '0', true);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION finverse_mark_split_member_departure() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_member_departure ON split_group_members;
CREATE TRIGGER split_member_departure
  AFTER DELETE ON split_group_members
  FOR EACH ROW EXECUTE FUNCTION finverse_mark_split_member_departure();

CREATE OR REPLACE FUNCTION finverse_remove_split_member(p_group_id text, p_target_user_id text)
RETURNS TABLE (result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor text := finverse_current_user_id();
  creator text;
  group_found boolean;
  target_role text;
  net bigint := 0;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'a scoped user is required to remove a member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One lock is shared with every financial-write trigger.
  SELECT true, g.created_by INTO group_found, creator
    FROM split_groups g
   WHERE g.id = p_group_id AND g.archived_at IS NULL
   FOR UPDATE;
  IF NOT COALESCE(group_found, false) THEN
    RETURN QUERY SELECT 'not_found'::text;
    RETURN;
  END IF;

  SELECT m.role INTO target_role
    FROM split_group_members m
   WHERE m.group_id = p_group_id AND m.user_id = p_target_user_id
   FOR UPDATE;
  IF target_role IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text;
    RETURN;
  END IF;
  IF creator = p_target_user_id THEN
    RETURN QUERY SELECT 'creator'::text;
    RETURN;
  END IF;
  IF actor <> p_target_user_id AND NOT EXISTS (
    SELECT 1 FROM split_group_members m
     WHERE m.group_id = p_group_id AND m.user_id = actor AND m.role = 'admin'
  ) THEN
    RETURN QUERY SELECT 'forbidden'::text;
    RETURN;
  END IF;

  SELECT net + COALESCE(sum(e.amount) FILTER (WHERE e.paid_by_user_id = p_target_user_id), 0)
    INTO net
    FROM split_expenses e WHERE e.group_id = p_group_id;
  SELECT net - COALESCE(sum(p.amount), 0)
    INTO net
    FROM split_expense_participants p WHERE p.group_id = p_group_id AND p.user_id = p_target_user_id;
  SELECT net + COALESCE(sum(s.amount) FILTER (WHERE s.from_user_id = p_target_user_id), 0)
              - COALESCE(sum(s.amount) FILTER (WHERE s.to_user_id = p_target_user_id), 0)
    INTO net
    FROM split_settlements s WHERE s.group_id = p_group_id;

  IF net <> 0 THEN
    RETURN QUERY SELECT 'balance_nonzero'::text;
    RETURN;
  END IF;

  DELETE FROM split_group_members
   WHERE split_group_members.group_id = p_group_id
     AND split_group_members.user_id = p_target_user_id;
  RETURN QUERY SELECT 'removed'::text;
END;
$$;

REVOKE ALL ON FUNCTION finverse_remove_split_member(text, text) FROM PUBLIC;
