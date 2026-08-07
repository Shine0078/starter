# FINVERSE

An AI-powered personal finance platform. Privacy-first, offline-capable,
automated.

[`MISSION.md`](MISSION.md) is the product brief. [`docs/`](docs/) turns it into
a plan. This README tells you how to run what exists.

**Status: Phase 0.** One vertical slice runs end to end against a mock
aggregator — import → categorize → budget → insights → health score. No real
bank is connected, and connecting one is gated on commercial agreements rather
than on code ([roadmap](docs/04-roadmap.md)).

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

## Layout

```
apps/
  api/          NestJS API — the vertical slice
    src/domain/   pure financial logic, no framework, no I/O
    src/ports/    interfaces the domain needs satisfied
    src/infra/    in-memory + mock adapters (Postgres/Plaid go here)
    src/modules/  controllers and services — thin wiring
    public/       developer dashboard
    test/         123 unit tests over the domain
  mobile/       Flutter client (scaffold — see note below)
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

Base path `/api`. Auth is Phase 1; until then `x-user-id` selects a user and
defaults to a demo account.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/sync` | Pull from the aggregator, categorize, persist |
| `GET` | `/accounts` | Balances and credit utilization |
| `GET` | `/transactions` | `?search=&category=&account=&from=&to=&limit=` |
| `GET` | `/transactions/needs-review` | What we refused to guess at |
| `PATCH` | `/transactions/:id/category` | Correct a category, optionally create a rule |
| `GET`/`POST` | `/budgets` | List / create |
| `GET` | `/budgets/progress` | Spend, thresholds, projections, alerts |
| `GET` | `/insights` | Month-to-date vs. the same window last month |
| `GET` | `/subscriptions` | Detected recurring charges and price rises |
| `GET` | `/health-score` | 0–1000 with per-component actions |
| `GET` | `/healthz` | Liveness |

## Postgres and Redis

Not required for the slice, but wired up:

```bash
npm run infra:up
```

The Postgres persistence adapter is the next task in Phase 0 — today the API
stores everything in memory and forgets it on restart.

## Notes on what is and isn't verified

- **The API and its domain logic run and are tested.** 123 unit tests, plus the
  slice exercised end to end over HTTP.
- **The Flutter app has never been compiled.** The Flutter SDK was not installed
  on the machine where it was written. It is a scaffold written against the API
  contract, not working code — see [apps/mobile/README.md](apps/mobile/README.md).
- **There is no CI yet.** Adding a GitHub Actions workflow needs the `workflow`
  scope on your token: `gh auth refresh -s workflow`.

## Where to read next

1. [docs/01-architecture.md](docs/01-architecture.md) — the shape of the system
2. [docs/05-vertical-slice.md](docs/05-vertical-slice.md) — what runs today
3. [docs/adr/](docs/adr/) — the decisions, including where the mission's
   zero-knowledge goal collides with its AI goals

## License

MIT — see [LICENSE](LICENSE).
