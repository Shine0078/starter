# Where the project stands

Written for whoever picks this up next — including a fresh agent session with no
memory of how any of it got here. Last updated after the MFA, professional
monthly-report, smart-alert, and core-accessibility milestones on 2026-08-08.

Read [`MISSION.md`](../MISSION.md) for the product, [`HANDOVER.md`](../HANDOVER.md)
for the backlog, and [`04-roadmap.md`](04-roadmap.md) for the sequence. This file
is the shortest path to being productive again.

## Start here

```bash
npm install
npm test          # 303 tests, no database needed
npm run test:db   # 399 tests, spins up a real PostgreSQL and tears it down
npm run dev       # API + dev dashboard on http://localhost:3000
```

The dashboard now requires an account. Create one on the sign-in panel; any
address works, the password needs 12+ characters. `correct horse battery staple`
is fine.

## Verified state

Every number below was produced by running the thing, not by reading the code.

| Check | Result |
|---|---|
| API tests, in-memory | 303 passed |
| API tests, real Postgres | 399 passed |
| `tsc --noEmit`, `npm run build` | clean |
| `flutter analyze`, `flutter test` | clean, 21 passed |
| Android debug compile | `com.finverse.finance`, API 36, 170.9 MB APK; debug-only artifact built successfully |
| Dashboard | register → sync → correct → logout, verified in a browser |
| API on Postgres as `finverse_app` | two users, 183 transactions each, sync → correct → re-sync → budget, isolation confirmed against the raw tables |

A previous version of this table said 225 and 288. Those were stale on the day
they were written; the counts above were re-measured.

## What is real, and what only looks real

**Real:** authentication (Argon2id, rotating refresh tokens with reuse
detection, global guard, per-account lockout, session list, audit trail);
Postgres persistence behind ports with a contract suite covering both adapters;
row-level security, with the API connecting as a role that cannot bypass it;
categorisation, budgets, insights, subscriptions, health score, cash-flow
forecast, credit-card planner, purchase simulator, CSV export. The Flutter
Settings screen can also request and share a private monthly PDF containing
vector charts, budget progress, subscriptions, forecast, and actions.
The notification centre derives conservative upcoming-bill, subscription-price,
possible-duplicate, and unusually-large-transaction review prompts and respects
each corresponding preference.

**Mock:** the aggregator. `MockAggregator` generates a deterministic four-month
ledger. No bank has ever been connected, and connecting one is gated on a
commercial agreement, not on code.

**Implemented but awaiting provider/device configuration:** email verification
and password reset use hashed one-time tokens and SMTP in production; TOTP MFA
uses encrypted secrets and one-time recovery codes; Android app lock uses system
device authentication. **Absent:** passkeys and OAuth.

## Last task: row-level security — done

The database now refuses the wrong rows even when a query forgets its filter.
[ADR-0006](adr/0006-row-level-security.md) has the reasoning; the short version:

- `003_rls.sql` enables **and forces** policies on `accounts`, `transactions`,
  `budgets`, `categorization_rules`, keyed on `current_setting('finverse.user_id')`.
- Every Postgres store call goes through `withUserScope` in
  `infra/postgres/pool.ts` — a transaction that pins that setting. It has to be
  transaction-local; session-local would follow the pooled connection to the
  next request.
- There are now **two connection strings**. `DATABASE_URL` is the schema owner
  and runs migrations. `DATABASE_APP_URL` is `finverse_app`, `NOSUPERUSER` and
  `NOBYPASSRLS`, and serves every request. This distinction is the whole thing:
  a superuser bypasses every policy and reports nothing.
- The role is created by the migration step from the credentials in
  `DATABASE_APP_URL`, so it does not have to exist first, and CI and the
  embedded harness both provision it automatically.
- `test/rls.spec.ts` asserts the preconditions (not a superuser, no BYPASSRLS,
  every table enabled *and* forced) before asserting anything about rows, then
  issues deliberately unfiltered SQL. Disabling the policies fails 16 of its 21
  tests — checked by temporarily disabling them, not assumed.

The whole store contract now runs as `finverse_app`, so all 309 tests execute
with the policies in force.

## Completed: account deletion and retention

Implemented in migration `004_account_deletion.sql`, the auth API, both persistence
adapters, the Flutter UI, and a PostgreSQL erasure acceptance test. The production
deployment must run `npm run purge:accounts --workspace @finverse/api` at least daily.

The implemented contract is:

1. **A deletion request endpoint** that sets `pending_deletion` and a grace
   period, revokes every session, and refuses to serve data in the meantime.
   Immediate hard deletion is the wrong default — an attacker with a stolen
   token should not be able to destroy someone's financial history irreversibly.
2. **A purge that actually purges.** The FK cascade removes the financial rows,
   while identity-linked and email-linked `auth_events` are explicitly erased.
3. **Proof.** A test creates a user with data, deletes, and then asserts
   zero rows in every table, queried as the owner so RLS cannot make an empty
   result look like success. That last detail is the trap: as `finverse_app`
   outside a scope, *every* table reads as empty whether or not anything was
   deleted. This now passes against real PostgreSQL.

Email verification and password reset now sit behind `EmailSender`: development
captures the one-time code, while production requires complete SMTP settings.
The same composition-root boundary keeps the delivery provider replaceable.

## Machine-specific gotchas

Things that cost time to rediscover:

- **Docker Desktop does not work here.** It fails on a stale socket and its WSL
  VM never starts. Do not spend time on it — `npm run test:db` uses
  `embedded-postgres` instead and needs no daemon. The broken runtime directory
  was moved aside to `%LOCALAPPDATA%\Docker\run.broken-*` if it is ever wanted.
- **`preview_start` reads `.claude/launch.json` from the primary working
  directory.** If a session is rooted at `portfolio`, it will start *that*
  project's Next.js server instead of this API. Root sessions at `starter`.
- **A store contract that connects as the owner proves nothing about RLS.**
  Superusers bypass policies silently, so `test/pg-harness.ts` hands the stores
  the `finverse_app` pool and keeps the owner's pool for truncation only. If a
  new database suite is added, follow that split.
- **Two DB suites share one database, so `test:db` runs files sequentially.**
  `fileParallelism` is off in `vitest.config.mts` when `TEST_DATABASE_URL` is
  set — in parallel, one suite's reset deletes the other's fixtures mid-assertion
  and the failure moves around between runs.
- **`loadConfig()` is memoised, and must stay that way.** It generates a random
  JWT secret in development; if each call produced a fresh one, tokens signed by
  the issuer would fail verification in the guard and every request would 401
  with nothing obviously wrong.
- **Tests set environment before importing `AppModule`**, for the same reason.
  Note the dynamic `await import` inside `beforeAll` in the auth specs.
- **Vitest needs SWC, not esbuild.** Nest resolves constructor dependencies from
  `design:paramtypes`, which only `emitDecoratorMetadata` produces. See
  `vitest.config.mts`.

## Bugs worth not reintroducing

Each of these shipped silently — no crash, no stack trace, just wrong numbers:

- **Uncategorised outflows were excluded from expenses.** An unrecognised $2,180
  rent payment vanished from spending, inflating the savings rate to 94% and the
  health score to 975. `unknown` is deliberately an `expense` category now.
- **Branch numbers survived descriptor normalisation.** `blue bottle 0093 san`
  meant a user's correction rule matched one store instead of the merchant,
  quietly defeating the whole tier-1 guarantee.
- **Month-to-date was compared against a full previous month**, so on the 7th
  every category read as "down 100%".
- **Frequent habits were reported as subscriptions.** Thirty wandering lunch
  charges will always contain three near their own median.
- **The mock aggregator emitted duplicate provider ids** — 182 transactions, 175
  unique — so seven silently overwrote each other. Caught by the idempotency
  test, not by reading the code.
- **A fake Argon2 hash used for login timing-equalisation** failed to parse and
  returned instantly, doing no work and leaving open exactly the account
  enumeration gap it existed to close.

## Owner actions nothing here can substitute for

An aggregator agreement (Plaid/Flinks — 4–12 weeks including their security
review), an email provider, hosting and KMS credentials, a registered domain
before passkeys are possible, Apple and Google developer accounts, and legal
review of the privacy policy and terms. See [`06-cheap-launch-path.md`](06-cheap-launch-path.md).
