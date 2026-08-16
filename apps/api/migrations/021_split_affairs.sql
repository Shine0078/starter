-- 021_split_affairs — shared expenses between FINVERSE users.
--
-- A group is owned by nobody: it is visible to its members. That makes RLS
-- membership-based instead of user-based, so every policy below reads
-- finverse_is_split_member() rather than a user_id column. The helper is
-- defined after the tables it references: a SQL-language function is parsed at
-- CREATE time, so it cannot be declared before split_group_members exists.
--
-- Account deletion deletes a user row; every foreign key here cascades or sets
-- NULL so a purged account cannot leave shared-financial rows behind:
--   * memberships, participant shares, settlements, and paid expenses cascade
--     (a deleted account's own contributions disappear),
--   * split_groups.created_by sets NULL (the group and other members survive).

-- ------------------------------------------------------------------ groups

CREATE TABLE split_groups (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  currency    char(3)     NOT NULL,
  created_by  text        REFERENCES users (id) ON DELETE SET NULL,
  created_at  date        NOT NULL,
  archived_at timestamptz,

  CONSTRAINT split_groups_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE TABLE split_group_members (
  group_id  text        NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
  user_id   text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (group_id, user_id),
  CONSTRAINT split_group_members_role CHECK (role IN ('admin', 'member'))
);

CREATE INDEX split_group_members_user_idx ON split_group_members (user_id);

-- ---------------------------------------------------------------- expenses

CREATE TABLE split_expenses (
  id              text        PRIMARY KEY,
  group_id        text        NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
  description     text        NOT NULL,
  category        text        NOT NULL DEFAULT 'other',
  amount          bigint      NOT NULL,
  currency        char(3)     NOT NULL,
  paid_by_user_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  split_method    text        NOT NULL,
  date            date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT split_expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT split_expenses_description_length
    CHECK (char_length(description) BETWEEN 1 AND 200),
  CONSTRAINT split_expenses_split_method CHECK (split_method IN ('equal', 'shares'))
);

CREATE TABLE split_expense_participants (
  expense_id text   NOT NULL REFERENCES split_expenses (id) ON DELETE CASCADE,
  group_id   text   NOT NULL,
  user_id    text   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount     bigint NOT NULL,

  PRIMARY KEY (expense_id, user_id),
  CONSTRAINT split_participants_amount_positive CHECK (amount > 0)
);

CREATE INDEX split_expenses_group_date_idx
  ON split_expenses (group_id, date DESC, id DESC);
CREATE INDEX split_expense_participants_group_user_idx
  ON split_expense_participants (group_id, user_id);

-- ------------------------------------------------------------- settlements

CREATE TABLE split_settlements (
  id           text        PRIMARY KEY,
  group_id     text        NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
  from_user_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user_id   text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount       bigint      NOT NULL,
  currency     char(3)     NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT split_settlements_amount_positive CHECK (amount > 0),
  CONSTRAINT split_settlements_distinct_users CHECK (from_user_id <> to_user_id)
);

CREATE INDEX split_settlements_group_idx
  ON split_settlements (group_id, created_at DESC, id DESC);

-- ------------------------------------------------------------ RLS policies

-- SECURITY DEFINER so the membership check bypasses the split_group_members
-- policy while answering. A plain SQL function would re-enter that policy for
-- every row it scans, which is an infinite recursion; running as the schema
-- owner (who is a superuser in the harness) sidesteps it. The function only
-- ever returns a boolean and is revoked from PUBLIC, so it reveals nothing.
CREATE OR REPLACE FUNCTION finverse_is_split_member(gid text) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (
    SELECT 1 FROM split_group_members m
    WHERE m.group_id = gid AND m.user_id = finverse_current_user_id()
  ) $$;

COMMENT ON FUNCTION finverse_is_split_member(text) IS
  'Whether the RLS-scoped user is a member of the given split group.';

REVOKE ALL ON FUNCTION finverse_is_split_member(text) FROM PUBLIC;

ALTER TABLE split_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_groups FORCE  ROW LEVEL SECURITY;
CREATE POLICY split_groups_member_access ON split_groups
  USING (finverse_is_split_member(id))
  WITH CHECK (created_by = finverse_current_user_id() OR finverse_is_split_member(id));

ALTER TABLE split_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_group_members FORCE  ROW LEVEL SECURITY;
CREATE POLICY split_group_members_member_access ON split_group_members
  USING (user_id = finverse_current_user_id() OR finverse_is_split_member(group_id))
  WITH CHECK (user_id = finverse_current_user_id() OR finverse_is_split_member(group_id));

ALTER TABLE split_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_expenses FORCE  ROW LEVEL SECURITY;
CREATE POLICY split_expenses_member_access ON split_expenses
  USING (finverse_is_split_member(group_id))
  WITH CHECK (finverse_is_split_member(group_id));

ALTER TABLE split_expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_expense_participants FORCE  ROW LEVEL SECURITY;
CREATE POLICY split_expense_participants_member_access ON split_expense_participants
  USING (finverse_is_split_member(group_id))
  WITH CHECK (finverse_is_split_member(group_id));

ALTER TABLE split_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_settlements FORCE  ROW LEVEL SECURITY;
CREATE POLICY split_settlements_member_access ON split_settlements
  USING (finverse_is_split_member(group_id))
  WITH CHECK (finverse_is_split_member(group_id));
