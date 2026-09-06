-- 034_split_membership_command_policies - keep direct SQL writes aligned with
-- the service authorization boundary. Membership rows are readable by active
-- members, but only group admins (or the creator during group creation) may
-- add members. A member may leave their own group, while only an admin may
-- remove another member; the creator membership is never deletable.

DROP POLICY split_group_members_member_access ON split_group_members;

CREATE POLICY split_group_members_select ON split_group_members
  FOR SELECT
  USING (finverse_is_split_member(group_id));

CREATE POLICY split_group_members_insert ON split_group_members
  FOR INSERT
  WITH CHECK (
    finverse_is_split_admin(group_id)
    OR (
      user_id = finverse_current_user_id()
      AND finverse_is_split_creator(group_id)
    )
  );

CREATE POLICY split_group_members_delete ON split_group_members
  FOR DELETE
  USING (
    user_id = finverse_current_user_id()
    OR finverse_is_split_admin(group_id)
  );

CREATE OR REPLACE FUNCTION finverse_prevent_split_creator_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM split_groups g
     WHERE g.id = OLD.group_id
       AND g.created_by = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'the split group creator membership cannot be removed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION finverse_prevent_split_creator_removal() FROM PUBLIC;

DROP TRIGGER IF EXISTS split_group_creator_membership_guard ON split_group_members;
CREATE TRIGGER split_group_creator_membership_guard
  BEFORE DELETE ON split_group_members
  FOR EACH ROW EXECUTE FUNCTION finverse_prevent_split_creator_removal();
