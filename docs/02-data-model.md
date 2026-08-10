# Data Model

Postgres is the system of record. The mobile client keeps session credentials and
the offline-cache encryption key in the operating-system keystore. Successful GET
payloads are cached in user-scoped SQLite rows as AES-256-GCM ciphertext for up to
30 days; the cache is purged on sign-out and account deletion.

The tables that exist today live in `apps/api/migrations` — numbered `.sql`
files, applied once each inside a transaction. What follows describes the full
target model; the migrations are deliberately narrower, covering only what the
store ports currently need. Migrating an empty table later is cheaper than
maintaining one nothing writes to. See [ADR-0002](adr/0002-pure-domain-layer.md)
for why the schema and its row mappers are hand-written SQL rather than an ORM's
output.

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
| `status` | text | `active`, `locked`, or `pending_deletion` |
| `deletion_requested_at` | timestamptz | start of the recovery window; nullable |
| `purge_after` | timestamptz | irreversible erasure time; nullable |

### `consent_events`
Append-only evidence for user-controlled processing and legal acknowledgement.
A new row is created for every optional grant or withdrawal; history is never
overwritten. Required Terms and Privacy Notice acknowledgements are inserted in
the same transaction as the user, so registration cannot leave an active account
without exact-version evidence. PostgreSQL RLS scopes rows to the user and the
user foreign key cascades during permanent account erasure.

| Column | Type | Notes |
|---|---|---|
| `id` | text | pk |
| `user_id` | text | fk to users, delete cascade |
| `kind` | text | `analytics`, `product_updates`, `terms`, or `privacy_notice` |
| `granted` | boolean | false records withdrawal rather than deleting evidence |
| `policy_version` | text | version presented when the choice was made |
| `source` | text | registration, user settings, or an audited migration |
| `created_at` | timestamptz | authoritative server time |

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
| `source` | text | `provider` or `manual`; only manual rows may be user-edited |
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

### `rate_limit_buckets`

Shared fixed-window request counters used by every API instance. Nest hashes the
route and client tracker before the storage adapter receives a key, so this table
does not persist IP addresses or user ids.

| Column | Type | Notes |
|---|---|---|
| `key_hash` | text | SHA-256 request key; composite pk |
| `throttler_name` | text | named policy; composite pk |
| `total_hits` | integer | current-window count |
| `window_expires_at` | timestamptz | fixed-window boundary |
| `blocked_until` | timestamptz | shared block expiry, nullable |

This table intentionally has no user RLS policy: registration and login are
rate-limited before a user is known. The restricted runtime role can update the
opaque counters but cannot change schema or migration history.

## Retention and deletion

The implemented lifecycle is:

- `DELETE /auth/account` requires the current password and the literal confirmation
  `DELETE`. It immediately sets `pending_deletion`, records the request, and revokes
  every session.
- `POST /auth/cancel-deletion` re-verifies email and password during the 30-day
  recovery window, restores the account, and issues a new session.
- The built runtime command `npm run purge:accounts --workspace @finverse/api`
  permanently deletes due users. During source-only development, use
  `npm run purge:accounts:dev --workspace @finverse/api` instead.
  Foreign-key cascades remove accounts, transactions, budgets, rules, and sessions;
  the job explicitly removes identity-linked and email-linked auth events first.
- The PostgreSQL acceptance test verifies physical absence using the schema owner,
  not an RLS-scoped query that could return an empty result while rows still exist.

The deployment platform must schedule the purge command at least daily. Aggregator
link revocation must be added with the real bank adapter. Analytics retention and
backup roll-off cannot be claimed until those systems exist and have been tested.

## Related

- [ADR-0003](adr/0003-integer-minor-units.md) — why `bigint` and not `numeric`
- [ADR-0006](adr/0006-row-level-security.md) — which tables carry isolation
  policies, and why `users`, `sessions` and `auth_events` cannot
- [03-security-privacy.md](03-security-privacy.md) — encryption and access
