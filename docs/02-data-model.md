# Data Model

Postgres is the system of record. The mobile client holds a SQLite subset for
offline reads.

## Entities

```
User ──┬── Institution Link ── Account ── Transaction ──┬── Category
       │                                                └── Merchant
       ├── Budget ── BudgetPeriod
       ├── Goal ── Contribution
       ├── CategorizationRule
       ├── Subscription
       └── HealthScoreSnapshot
```

## Core tables

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `email` | citext | unique; encrypted at rest |
| `base_currency` | char(3) | ISO 4217; totals normalize to this |
| `country` | char(2) | drives which aggregator and compliance layer applies |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz | soft delete; hard purge job runs at +30d |

### `institution_links`
The connection to an aggregator. **No bank credentials, ever.** We store the
aggregator's opaque item/link token and nothing that could authenticate as the user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `user_id` | uuid | fk |
| `provider` | enum | `plaid` \| `tink` \| `flinks` \| `truelayer` \| `mock` |
| `provider_item_id` | text | opaque; encrypted at rest |
| `status` | enum | `healthy` \| `needs_reauth` \| `revoked` |
| `last_synced_at` | timestamptz | |

### `accounts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `link_id` | uuid | fk, nullable — manual/cash accounts have no link |
| `type` | enum | `checking` \| `savings` \| `credit_card` \| `investment` \| `cash` \| `loan` |
| `mask` | char(4) | last four only; never the full number |
| `balance_current` | bigint | minor units |
| `balance_available` | bigint | minor units, nullable |
| `currency` | char(3) | |
| `credit_limit` | bigint | nullable; credit cards only |
| `statement_day` | smallint | nullable; 1–31, drives the credit-card engine |
| `payment_due_day` | smallint | nullable |

### `transactions`
The hot table. Expect this to dominate row count — plan indexes accordingly.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `account_id` | uuid | fk |
| `provider_txn_id` | text | unique per link; **the idempotency key for sync** |
| `posted_at` | date | |
| `amount` | bigint | minor units; negative = outflow |
| `currency` | char(3) | |
| `raw_descriptor` | text | exactly as the bank sent it |
| `normalized_descriptor` | text | processor prefixes and noise stripped |
| `merchant_id` | uuid | nullable fk |
| `category_id` | uuid | fk |
| `category_source` | enum | `user_rule` \| `lexicon` \| `model` \| `user_manual` \| `unknown` |
| `category_confidence` | real | 0–1 |
| `is_recurring` | bool | set by subscription detection |
| `pending` | bool | pending transactions can change amount or vanish |

Indexes:
```sql
CREATE UNIQUE INDEX ON transactions (account_id, provider_txn_id);
CREATE INDEX ON transactions (account_id, posted_at DESC);
CREATE INDEX ON transactions (category_id, posted_at DESC);
CREATE INDEX ON transactions USING gin (normalized_descriptor gin_trgm_ops);
```

The unique index on `(account_id, provider_txn_id)` is what makes sync idempotent.
Aggregators re-send transactions freely; without this, every sync duplicates history
and every number in the app is wrong.

### `categories`
Hierarchical, two levels. `Food` → `Restaurants`, `Groceries`, `Coffee`.
System categories are seeded and immutable; users may add children.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `parent_id` | uuid | nullable self-fk |
| `slug` | text | stable identifier used in code |
| `user_id` | uuid | null = system category |

### `categorization_rules`
Tier 1. Deterministic, user-owned, always wins.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `user_id` | uuid | fk |
| `match_type` | enum | `contains` \| `exact` \| `regex` |
| `pattern` | text | matched against `normalized_descriptor` |
| `category_id` | uuid | fk |
| `priority` | int | lower wins ties |

### `budgets` / `budget_periods`
A `budget` is the standing intent ("$400/month on Restaurants"). A `budget_period` is
one concrete window with its computed spend. Separating them keeps history honest when
a user changes the limit mid-year — past periods keep the limit they were judged against.

| `budgets` | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `user_id` | uuid | fk |
| `category_id` | uuid | fk |
| `limit_amount` | bigint | minor units, positive |
| `period` | enum | `weekly` \| `monthly` \| `yearly` |
| `rollover` | bool | unspent carries forward |

### `subscriptions`
Derived, not declared. Detection writes here; the user can confirm or dismiss.

| Column | Type | Notes |
|---|---|---|
| `merchant_id` | uuid | fk |
| `cadence_days` | int | inferred interval |
| `typical_amount` | bigint | median of observed charges |
| `last_seen_at` | date | |
| `state` | enum | `detected` \| `confirmed` \| `dismissed` \| `cancelled` |

## Retention and deletion

The mission promises complete account deletion. That has to survive contact with
backups and analytics:

- `DELETE /me` soft-deletes immediately and revokes all aggregator links **first** —
  an orphaned link keeps pulling data we no longer have a right to hold.
- A purge job hard-deletes at +30 days (the window covers accidental deletion).
- Analytics events carry a pseudonymous id joined only through a mapping table that
  is deleted in the same purge, which is what actually makes the deletion real.
- Backups roll off on a 35-day cycle, chosen to sit just past the purge window so no
  backup outlives the deletion it should have honored.

## Related

- [ADR-0003](adr/0003-integer-minor-units.md) — why `bigint` and not `numeric`
- [03-security-privacy.md](03-security-privacy.md) — encryption and access
