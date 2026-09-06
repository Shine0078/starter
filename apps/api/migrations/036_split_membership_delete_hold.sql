-- 036_split_membership_delete_hold - direct membership deletion stays closed
-- until a service/database command can lock the group and prove that removing
-- a member will not strand a non-zero balance. The creator trigger from 034 is
-- retained as defense in depth if a future command policy is introduced.

DROP POLICY IF EXISTS split_group_members_delete ON split_group_members;
