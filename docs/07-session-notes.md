# Where the project stands

Written at commit `04b0570` for whoever picks this up next — including a fresh
agent session with no memory of how any of it got here.

Read [`MISSION.md`](../MISSION.md) for the product, [`HANDOVER.md`](../HANDOVER.md)
for the backlog, and [`04-roadmap.md`](04-roadmap.md) for the sequence. This file
is the shortest path to being productive again.

## Start here

```bash
npm install
npm test          # 225 tests, no database needed
npm run test:db   # 288 tests, spins up a real PostgreSQL and tears it down
npm run dev       # API + dev dashboard on http://localhost:3000
```

The dashboard now requires an account. Create one on the sign-in panel; any
address works, the password needs 12+ characters. `correct horse battery staple`
is fine.

## Verified state

Every number below was produced by running the thing, not by reading the code.

| Check | Result |
|---|---|
| API tests, in-memory | 225 passed |
| API tests, real Postgres | 288 passed |
| `tsc --noEmit`, `npm run build` | clean |
| `flutter analyze`, `flutter test` | clean, 7 passed |
| Dashboard | register → sync → correct → logout, verified in a browser |

## What is real, and what only looks real

**Real:** authentication (Argon2id, rotating refresh tokens with reuse
detection, global guard, per-account lockout, session list, audit trail);
Postgres persistence behind ports with a contract suite covering both adapters;
categorisation, budgets, insights, subscriptions, health score, cash-flow
forecast, credit-card planner, purchase simulator, CSV export.

**Mock:** the aggregator. `MockAggregator` generates a deterministic four-month
ledger. No bank has ever been connected, and connecting one is gated on a
commercial agreement, not on code.

**Absent, despite sounding covered:** email verification and password reset
(both need an email provider), MFA, passkeys, OAuth. `users.email_verified_at`
exists as a column but nothing ever sets it — an address is currently unproven.

## Next task: row-level security

Isolation today is enforced by application code. Every store method takes
`userId`, every query filters on it, and `test/auth-api.spec.ts` attempts
cross-user reads and writes and is refused. What is missing is the database
refusing to serve the wrong rows *even if a query forgets its filter*.

Three prerequisites, in order. Skipping either of the first two produces
policies that silently never apply, which is worse than none — the tests
"proving" isolation would pass against nothing:

1. **A non-superuser role.** Superusers bypass RLS entirely, and both
   docker-compose and the embedded harness connect as one. Create
   `finverse_app`, grant it, and point `DATABASE_URL` at it.
2. **A user in scope per request.** Policies need
   `current_setting('finverse.user_id')`, which means `SET LOCAL` inside a
   transaction — so the Postgres stores in `src/infra/postgres/stores.ts` must
   route each call through a transaction rather than borrowing a pooled
   connection directly. Every method already receives `userId`, so no signature
   changes.
3. **Only four tables qualify.** `accounts`, `transactions`, `budgets`,
   `categorization_rules`. `users`, `sessions`, and `auth_events` are read
   before a user is known — login, refresh, lockout counting — so they stay
   under application control by necessity.

Then add tests that set the session variable to user A and try to read user B.

## Machine-specific gotchas

Things that cost time to rediscover:

- **Docker Desktop does not work here.** It fails on a stale socket and its WSL
  VM never starts. Do not spend time on it — `npm run test:db` uses
  `embedded-postgres` instead and needs no daemon. The broken runtime directory
  was moved aside to `%LOCALAPPDATA%\Docker\run.broken-*` if it is ever wanted.
- **`preview_start` reads `.claude/launch.json` from the primary working
  directory.** If a session is rooted at `portfolio`, it will start *that*
  project's Next.js server instead of this API. Root sessions at `starter`.
- **`loadConfig()` is memoised, and must stay that way.** It generates a random
  JWT secret in development; if each call produced a fresh one, tokens signed by
  the issuer would fail verification in the guard and every request would 401
  with nothing obviously wrong.
- **Tests set environment before importing `AppModule`**, for the same reason.
  Note the dynamic `await import` inside `beforeAll` in the auth specs.
- **Vitest needs SWC, not esbuild.** Nest resolves constructor dependencies from
  `design:paramtypes`, which only `emitDecoratorMetadata` produces. See
  `vitest.config.ts`.

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
