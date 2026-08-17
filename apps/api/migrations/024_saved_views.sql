-- 024_saved_views — named transaction filters a user can return to.
--
-- The filter is stored as explicit columns rather than a JSON blob. A blob
-- would accept any shape, including keys the query layer silently ignores, so a
-- saved view could quietly stop meaning what the user set. Columns force a
-- migration when the query contract grows, which is the point: an unsupported
-- filter should be a schema change someone noticed, not a field that stops
-- applying.
--
-- Every column mirrors a field of TransactionQuery in src/ports/index.ts. There
-- is deliberately no second copy of the filtering logic — a view is applied by
-- handing these values back to the same store method the transaction list uses.

CREATE TABLE IF NOT EXISTS saved_views (
  id             text        NOT NULL,
  user_id        text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name           text        NOT NULL,
  -- Filter fields. All nullable: absent means "do not constrain".
  search         text,
  category_slug  text,
  category_kind  text,
  account_id     text,
  tag            text,
  date_from      date,
  date_to        date,
  amount_min     bigint,
  amount_max     bigint,
  pending        boolean,
  recurring      boolean,
  created_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT saved_views_name_bounded
    CHECK (length(name) BETWEEN 1 AND 60),
  CONSTRAINT saved_views_category_kind_valid
    CHECK (category_kind IS NULL
           OR category_kind IN ('expense', 'income', 'transfer', 'special')),
  -- An inverted range matches nothing and is always a mistake, not an intent.
  CONSTRAINT saved_views_date_range_ordered
    CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to),
  CONSTRAINT saved_views_amount_range_ordered
    CHECK (amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max),
  CONSTRAINT saved_views_amounts_nonnegative
    CHECK ((amount_min IS NULL OR amount_min >= 0)
           AND (amount_max IS NULL OR amount_max >= 0))
);

-- One view per name per user, case-insensitively. Two views called "Coffee"
-- and "coffee" are a mistake someone is about to make repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS saved_views_user_name_key
  ON saved_views (user_id, lower(name));

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_views_user_isolation ON saved_views;
CREATE POLICY saved_views_user_isolation ON saved_views
  USING (user_id = finverse_current_user_id())
  WITH CHECK (user_id = finverse_current_user_id());
