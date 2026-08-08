# FINVERSE

An AI-powered personal finance platform. Privacy-first, offline-capable,
automated.

[`MISSION.md`](MISSION.md) is the product brief. [`docs/`](docs/) turns it into
a plan. This README tells you how to run what exists.

**Status: launch engineering in progress.** The API and Android app include real
Plaid Sandbox Link, encrypted token storage, incremental sync, budgets, goals,
notifications, insights, and account lifecycle controls. Production Plaid access,
hosting, legal review, store approval, and billing remain external launch gates
([selling audit](docs/08-what-blocks-selling.md)).

## Quick start

```bash
npm install
```

Run the whole pipeline in-process and watch it work — no server, no database:

```bash
npm run demo
```

Or start the API with its developer dashboard at <http://localhost:3000/>:

```bash
npm run dev
```

Run the tests:

```bash
npm test
```

On Windows, configure Plaid Sandbox without writing credentials into the repo:

```powershell
npm run plaid:configure --workspace @finverse/api
```

Open the one-time loopback URL it prints, paste the Client ID and Sandbox secret,
then restart open terminals. The helper stores user-level development variables
and preserves an existing bank-token encryption key. Production must use the
hosting provider's secret manager instead.

## Layout

```
apps/
  api/          NestJS API — the vertical slice
    src/domain/   pure financial logic, no framework, no I/O
    src/ports/    interfaces the domain needs satisfied
    src/infra/    in-memory, Postgres, mock, email, and Plaid adapters
    src/modules/  controllers and services — thin wiring
    public/       developer dashboard
    test/         domain, HTTP, persistence, isolation, and Plaid tests
  mobile/       Flutter Android client with native Plaid Link
packages/
  contracts/    shared API types
infra/          docker-compose: Postgres + Redis
docs/           architecture, data model, privacy, roadmap, ADRs
```

## The one rule

**Domain logic is pure. Infrastructure is an adapter.**

Categorization, budget arithmetic, insight derivation, and the health score are
plain functions over plain data — no framework imports, no database, no clock
access. Everything else sits behind a port interface.

That is why the tests run in under two seconds without a database, and why the
slice runs today with no Docker. See [ADR-0002](docs/adr/0002-pure-domain-layer.md).

## API

Base path `/api`. **Every route requires a bearer token** except those marked
public — the guard is registered globally, so a new controller is protected the
moment it is written.

```bash
curl -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery staple"}'
```

Then send `Authorization: Bearer <accessToken>` on everything else. Access tokens
last 15 minutes; exchange the refresh token at `/api/auth/refresh` for a new pair.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/register` | **Public.** Create an account, returns a session |
| `POST` | `/auth/login` | **Public.** Exchange credentials for a session |
| `POST` | `/auth/refresh` | **Public.** Rotate the refresh token |
| `POST` | `/auth/logout` | End this session |
| `POST` | `/auth/logout-all` | End every session on every device |
| `GET` | `/auth/me` | The signed-in user |
| `GET` | `/auth/sessions` | Active sessions, with the current one marked |
| `DELETE` | `/auth/sessions/:id` | Revoke one session |
| `POST` | `/privacy/export` | Password-confirmed portable JSON export of user-owned data and security activity |
| `GET` | `/privacy` | Optional consent state/history, security activity, and retention summary |
| `PATCH` | `/privacy/consents/:kind` | Append a grant/withdrawal event for analytics or product updates |
| `POST` | `/sync` | Pull from the aggregator, categorize, persist |
| `GET` | `/bank-links` | List connected institutions and sync health |
| `POST` | `/bank-links/link-token` | Create a Plaid Link token (new or update mode) |
| `POST` | `/bank-links/exchange` | Exchange a temporary public token and begin sync |
| `POST` | `/bank-links/:id/sync` | Incrementally reconcile one institution |
| `DELETE` | `/bank-links/:id` | Revoke Plaid access and remove the stored token |
| `GET` | `/accounts` | Balances and credit utilization |
| `GET` | `/transactions` | `?search=&category=&account=&from=&to=&limit=` |
| `GET` | `/transactions/export.csv` | Download the user-owned ledger as a CSV; spreadsheet-formula-safe text fields |
| `GET` | `/transactions/needs-review` | What we refused to guess at |
| `PATCH` | `/transactions/:id/category` | Correct a category, optionally create a rule |
| `GET`/`POST` | `/budgets` | List / create |
| `GET` | `/budgets/progress` | Spend, thresholds, projections, alerts |
| `GET` | `/insights` | Month-to-date vs. the same window last month |
| `GET` | `/subscriptions` | Detected recurring charges and price rises |
| `GET` | `/health-score` | 0–1000 with per-component actions |
| `GET` | `/cash-flow-forecast?days=7|30|90` | Conservative liquid-cash outlook from repeatable income and bills |
| `GET` | `/purchase-scenario?days=7|30|90&amount=<minor>&date=YYYY-MM-DD` | One-off purchase impact against the same conservative outlook |
| `GET` | `/credit-cards` | Utilization, pay-down target, and an early payment window |
| `GET` | `/categories` | **Public.** The seeded category tree |
| `GET` | `/healthz` | **Public.** Liveness and database readiness |

## Persistence

Two adapters implement the same store ports. Which one runs is decided in one
place — `src/modules/core.module.ts` — and nothing in the domain, the services,
or the controllers knows the difference.

| `STORE` | Behaviour |
|---|---|
| `postgres` | Persists. Requires `DATABASE_URL`. |
| `memory` | Fast, zero-dependency, **lost on restart**. |

The default is `postgres` when `DATABASE_URL` is set and `memory` otherwise, so
the repo works on a machine with no database but persists as soon as one exists.

```bash
npm run infra:up                        # Postgres + Redis via docker compose
cd apps/api && cp .env.example .env     # both URLs are already filled in
npm run dev
```

Two connection strings, deliberately. `DATABASE_URL` is the schema owner and is
used for migrations only; `DATABASE_APP_URL` is the restricted role that serves
requests, and it is the one row-level security applies to — a superuser bypasses
every policy without saying so. The role is created by the migration step from
the credentials in that URL, so it does not have to exist beforehand. Leaving it
unset still runs, and logs on every boot that isolation is resting on
application code alone. See [ADR-0006](docs/adr/0006-row-level-security.md).

Migrations live in `apps/api/migrations` as numbered `.sql` files, applied once
each inside a transaction. They run automatically on boot in development; set
`MIGRATE_ON_BOOT=false` in production and run them as a deploy step, so two
instances starting together cannot race.

```bash
npm run migrate --workspace @finverse/api
```

`GET /healthz` reports `status: "degraded"` when the database is unreachable
rather than claiming success because the process is alive.

### Testing against Postgres

The store contract suite runs against both adapters — the same assertions, twice —
so a divergence between them fails a test rather than surfacing as a wrong number
in production.

One command, no Docker required. It unpacks the official PostgreSQL binaries,
runs the suite against them, and throws the data directory away afterwards:

```bash
npm run test:db
```

`npm test` on its own skips the Postgres half and runs the in-memory adapter
only — that is what a contributor without a database gets, and it must keep
passing on its own.

The suite creates the restricted `finverse_app` role itself and connects the
stores through it, so both halves of row-level security — the policies and the
role they apply to — are exercised on every run rather than only in production.

To leave a database running for `npm run dev`:

```bash
npm run db:start
```

It prints both connection strings to paste into `.env`.

If you prefer containers, `npm run infra:up` brings up the same thing via
docker compose. Docker is never required: it does not start reliably on every
machine, and a database test that silently skips is one nobody notices has
stopped running.

## Notes on what is and isn't verified

- **The API and its domain logic run and are tested.** 285 tests run with no
  database; the full suite is **379 passing** against real PostgreSQL, including
  the store contract — which runs as the restricted role, so it executes with the
  row-level security policies in force — and a suite that issues deliberately
  unfiltered SQL to prove the database withholds other users' rows on its own.
  The slice is also exercised end to end over HTTP.
- **The Flutter app is verified by static analysis, a widget test, and a real
  Android debug APK build.** Android and iOS platform projects can be generated
  locally. See the
  [cheap launch path](docs/06-cheap-launch-path.md).
- **CI is ready in `.github/workflows/ci.yml`.** It starts automatically after a
  commit is pushed to GitHub and requires no secrets for its default checks.

## Where to read next

1. [docs/01-architecture.md](docs/01-architecture.md) — the shape of the system
2. [docs/05-vertical-slice.md](docs/05-vertical-slice.md) — what runs today
3. [docs/adr/](docs/adr/) — the decisions, including where the mission's
   zero-knowledge goal collides with its AI goals
4. [docs/06-cheap-launch-path.md](docs/06-cheap-launch-path.md) — the cheapest
   safe route to a personal Android beta

## License

MIT — see [LICENSE](LICENSE).
