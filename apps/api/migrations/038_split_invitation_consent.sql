-- 038_split_invitation_consent - membership is granted only after invitee
-- consent. The invitation row is the durable, auditable state machine.

CREATE TABLE split_group_invitations (
  id                 text PRIMARY KEY,
  group_id           text NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
  invitee_user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invited_by_user_id text REFERENCES users (id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,

  CONSTRAINT split_group_invitations_status CHECK
    (status IN ('pending', 'accepted', 'declined', 'revoked', 'left', 'removed')),
  CONSTRAINT split_group_invitations_decision_time CHECK
    ((status = 'pending' AND decided_at IS NULL) OR
     (status <> 'pending' AND decided_at IS NOT NULL)),
  CONSTRAINT split_group_invitations_not_self
    CHECK (invitee_user_id <> invited_by_user_id)
);

CREATE UNIQUE INDEX split_group_invitations_one_pending
  ON split_group_invitations (group_id, invitee_user_id)
  WHERE status = 'pending';
CREATE INDEX split_group_invitations_invitee_idx
  ON split_group_invitations (invitee_user_id, status, created_at DESC);

ALTER TABLE split_group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_group_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY split_group_invitations_select ON split_group_invitations
  FOR SELECT
  USING (
    invitee_user_id = finverse_current_user_id()
    OR finverse_is_split_admin(group_id)
  );

CREATE POLICY split_group_invitations_insert ON split_group_invitations
  FOR INSERT
  WITH CHECK (
    finverse_is_split_admin(group_id)
    AND invited_by_user_id = finverse_current_user_id()
    AND status = 'pending'
  );

CREATE POLICY split_group_invitations_invitee_decide ON split_group_invitations
  FOR UPDATE
  USING (invitee_user_id = finverse_current_user_id() AND status = 'pending')
  WITH CHECK (
    invitee_user_id = finverse_current_user_id()
    AND status IN ('accepted', 'declined')
  );

CREATE POLICY split_group_invitations_admin_revoke ON split_group_invitations
  FOR UPDATE
  USING (finverse_is_split_admin(group_id) AND status = 'pending')
  WITH CHECK (finverse_is_split_admin(group_id) AND status = 'revoked');

-- Invitees need only the minimum context required to give informed consent.
-- This function is deliberately narrow and is not a general group read API.
CREATE OR REPLACE FUNCTION finverse_split_invitation_context(invitation_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN i.id IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(
      'groupName', g.name,
      'currency', g.currency,
      'invitedByEmail', inviter.email
    )
  END
  FROM split_group_invitations i
  JOIN split_groups g ON g.id = i.group_id
  LEFT JOIN users inviter ON inviter.id = i.invited_by_user_id
  WHERE i.id = invitation_id
    AND (i.invitee_user_id = finverse_current_user_id() OR finverse_is_split_admin(i.group_id))
$$;

REVOKE ALL ON FUNCTION finverse_split_invitation_context(text) FROM PUBLIC;

-- No caller may directly add another user's membership. The only member
-- inserts are creator bootstrap or an invitee inserting their own row while a
-- pending invitation exists. The trigger below consumes that invitation in the
-- same transaction.
CREATE OR REPLACE FUNCTION finverse_has_pending_split_invitation(gid text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM split_group_invitations i
      JOIN split_groups g ON g.id = i.group_id
     WHERE i.group_id = gid
       AND i.invitee_user_id = finverse_current_user_id()
       AND i.status = 'pending'
       AND g.archived_at IS NULL
  )
$$;

REVOKE ALL ON FUNCTION finverse_has_pending_split_invitation(text) FROM PUBLIC;

DROP POLICY split_group_members_insert ON split_group_members;
CREATE POLICY split_group_members_insert ON split_group_members
  FOR INSERT
  WITH CHECK (
    (
      user_id = finverse_current_user_id()
      AND role = 'admin'
      AND finverse_is_split_creator(group_id)
    )
  );

CREATE OR REPLACE FUNCTION finverse_consume_split_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  consumed integer;
BEGIN
  -- Owner-side maintenance (account deletion and test fixtures) has no user
  -- scope. It must not be mistaken for an invitee acceptance.
  IF finverse_current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role <> 'member' OR NEW.user_id <> finverse_current_user_id() THEN
    RETURN NEW;
  END IF;

  UPDATE split_group_invitations
     SET status = 'accepted', decided_at = now()
   WHERE group_id = NEW.group_id
     AND invitee_user_id = NEW.user_id
     AND status = 'pending';
  GET DIAGNOSTICS consumed = ROW_COUNT;
  IF consumed <> 1 THEN
    RAISE EXCEPTION 'a pending invitation is required to join this split group'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finverse_consume_split_invitation() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_consume_invitation ON split_group_members;
CREATE TRIGGER split_consume_invitation
  AFTER INSERT ON split_group_members
  FOR EACH ROW EXECUTE FUNCTION finverse_consume_split_invitation();

-- Invitation fields and transitions are immutable except for the one command
-- represented by each state transition. RLS policies cannot safely compare OLD
-- and NEW because permissive policies combine with OR.
CREATE OR REPLACE FUNCTION finverse_validate_split_invitation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Cascading user deletion is owner-side maintenance and may null the
  -- inviter reference without changing invitation state.
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

REVOKE ALL ON FUNCTION finverse_validate_split_invitation_transition() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_invitation_transition_guard ON split_group_invitations;
CREATE TRIGGER split_invitation_transition_guard
  BEFORE UPDATE ON split_group_invitations
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_invitation_transition();

-- Acceptance is a single privileged command rather than a client-composed
-- UPDATE followed by INSERT. The function is the only runtime grant that can
-- create an invitee membership; it locks the invitation first, verifies the
-- scoped actor, and relies on the trigger above to consume the pending row.
CREATE OR REPLACE FUNCTION finverse_accept_split_invitation(invitation_id text)
RETURNS TABLE (group_id text, user_id text, role text, joined_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invite_group text;
  invite_user text;
BEGIN
  IF finverse_current_user_id() IS NULL THEN
    RAISE EXCEPTION 'a scoped user is required to accept an invitation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT i.group_id, i.invitee_user_id
    INTO invite_group, invite_user
    FROM split_group_invitations i
   WHERE i.id = invitation_id
     AND i.invitee_user_id = finverse_current_user_id()
     AND i.status = 'pending'
   FOR UPDATE;

  IF invite_group IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    INSERT INTO split_group_members (group_id, user_id, role)
    VALUES (invite_group, invite_user, 'member')
    RETURNING split_group_members.group_id,
              split_group_members.user_id,
              split_group_members.role,
              split_group_members.joined_at;
END;
$$;

REVOKE ALL ON FUNCTION finverse_accept_split_invitation(text) FROM PUBLIC;

-- Keep participant rows tied to the same group as their expense. This closes a
-- cross-group insertion primitive that would otherwise corrupt balances.
ALTER TABLE split_expenses
  ADD CONSTRAINT split_expenses_id_group_unique UNIQUE (id, group_id);
ALTER TABLE split_expense_participants
  ADD CONSTRAINT split_participants_expense_group_fk
  FOREIGN KEY (expense_id, group_id)
  REFERENCES split_expenses (id, group_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION finverse_validate_split_financial_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  archived timestamptz;
BEGIN
  SELECT archived_at INTO archived FROM split_groups WHERE id = NEW.group_id;
  IF archived IS NOT NULL THEN
    RAISE EXCEPTION 'archived split groups are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finverse_validate_split_financial_write() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_expenses_active_guard ON split_expenses;
CREATE TRIGGER split_expenses_active_guard
  BEFORE INSERT OR UPDATE ON split_expenses
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_financial_write();
DROP TRIGGER IF EXISTS split_settlements_active_guard ON split_settlements;
CREATE TRIGGER split_settlements_active_guard
  BEFORE INSERT OR UPDATE ON split_settlements
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_financial_write();

CREATE OR REPLACE FUNCTION finverse_validate_split_settlement_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.from_user_id <> finverse_current_user_id()
     OR NOT EXISTS (
       SELECT 1 FROM split_group_members m
        WHERE m.group_id = NEW.group_id
          AND m.user_id = NEW.to_user_id
     ) THEN
    RAISE EXCEPTION 'settlement actor and recipient must be active group members'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finverse_validate_split_settlement_actor() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_settlements_actor_guard ON split_settlements;
CREATE TRIGGER split_settlements_actor_guard
  BEFORE INSERT OR UPDATE OF from_user_id, to_user_id, group_id ON split_settlements
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_settlement_actor();

CREATE OR REPLACE FUNCTION finverse_validate_split_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM split_groups g
     WHERE g.id = NEW.group_id AND g.archived_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM split_group_members m
     WHERE m.group_id = NEW.group_id AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'participant must be an active member of the split group'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finverse_validate_split_participant() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_participants_active_guard ON split_expense_participants;
CREATE TRIGGER split_participants_active_guard
  BEFORE INSERT OR UPDATE ON split_expense_participants
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_participant();

CREATE OR REPLACE FUNCTION finverse_validate_split_group_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Cascading account deletion is owner-side maintenance and may null the
  -- creator reference without being a user command.
  IF finverse_current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.name <> OLD.name OR NEW.currency <> OLD.currency
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at <> OLD.created_at
     OR OLD.archived_at IS NOT NULL
     OR NOT finverse_is_split_creator(OLD.id)
     OR NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'only the creator may archive an active split group'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finverse_validate_split_group_update() FROM PUBLIC;
DROP TRIGGER IF EXISTS split_group_update_guard ON split_groups;
CREATE TRIGGER split_group_update_guard
  BEFORE UPDATE ON split_groups
  FOR EACH ROW EXECUTE FUNCTION finverse_validate_split_group_update();
