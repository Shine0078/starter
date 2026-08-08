CREATE TABLE goals (
  id            text        NOT NULL,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          text        NOT NULL,
  target_amount bigint      NOT NULL,
  currency      char(3)     NOT NULL,
  target_date   date,
  created_at    date        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT goals_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT goals_target_positive CHECK (target_amount > 0)
);

CREATE TABLE goal_contributions (
  id             text   NOT NULL,
  user_id        text   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  goal_id        text   NOT NULL,
  amount         bigint NOT NULL,
  contributed_at date   NOT NULL,

  PRIMARY KEY (user_id, id),
  CONSTRAINT goal_contributions_amount_positive CHECK (amount > 0),
  CONSTRAINT goal_contributions_goal_fk
    FOREIGN KEY (user_id, goal_id) REFERENCES goals (user_id, id) ON DELETE CASCADE
);

CREATE INDEX goals_user_target_date_idx ON goals (user_id, target_date);
CREATE INDEX goal_contributions_goal_date_idx
  ON goal_contributions (user_id, goal_id, contributed_at DESC, id DESC);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;
CREATE POLICY goals_user_isolation ON goals
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());

ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions FORCE ROW LEVEL SECURITY;
CREATE POLICY goal_contributions_user_isolation ON goal_contributions
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
