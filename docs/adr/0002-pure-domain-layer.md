# ADR-0002: Pure domain layer with ports and adapters

**Status:** Accepted · **Date:** 2026-08-07

## Context

The financial logic — categorization, budget thresholds, savings rate, the health
score — is where correctness matters most and where bugs are least visible. A budget
that alerts at 89% instead of 90% produces no stack trace.

The mission also requires supporting several aggregators (Plaid, Tink, TrueLayer,
Flinks, Salt Edge) because coverage is regional. We will integrate more than one.

## Decision

Domain logic lives in `apps/api/src/domain/` as pure functions over plain data
structures. No framework imports, no I/O, no clock access — the current time is passed
in as an argument.

Everything the domain needs from the outside world is declared as a **port** (a
TypeScript interface) in `apps/api/src/ports/`, and implemented by **adapters** in
`apps/api/src/infra/`:

| Port | Adapters |
|---|---|
| `TransactionStore`, `AccountStore`, `BudgetStore` | `InMemory*` (dev/test), `Postgres*` (production) |
| `AggregatorPort` | `MockAggregator`, later `PlaidAggregator`, `FlinksAggregator` |
| `LlmPort` | `NoopLlm`, later a hosted or self-hosted model |
| `ClockPort` | `SystemClock`, `FixedClock` (tests) |

NestJS modules are wiring. Controllers parse and validate input, call domain
functions, and serialize output. They contain no arithmetic.

## Consequences

**Good:** the money math is tested exhaustively in milliseconds with no database.
Time-dependent logic is deterministic because the clock is injected. A second
aggregator is a new file implementing a known interface, not a refactor. And the
vertical slice in this repo runs today with no Docker, because `InMemoryStore`
satisfies the same interface Postgres will.

**Bad:** more indirection than a straight `service → ORM` design. A reader tracing a
request passes through an interface boundary to find the implementation. This costs
real navigation time and is the honest price of the decision.

**Enforcement:** an ESLint boundary rule forbids importing `@nestjs/*`, `@prisma/*`,
or anything under `infra/` from within `domain/`. Without automated enforcement this
decision erodes within a month — the first person in a hurry imports the repository
directly and nobody notices in review.

## Alternatives rejected

- **Active Record / fat entities on the ORM.** Couples the financial rules to the
  persistence layer, which means testing a budget threshold requires a database.
- **Anemic services calling the ORM directly.** The default NestJS shape. Fine for
  CRUD; poor when the interesting logic is arithmetic that must be provably right.
