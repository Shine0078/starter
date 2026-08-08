# Architecture

## Shape

A **modular monolith** behind one API gateway, with the module boundaries drawn where
we expect to split later. Not microservices — at zero users, microservices buy
distributed-systems problems and sell nothing.

```
┌─────────────────────────────────────────────────────────────┐
│  Clients                                                    │
│  Flutter (Android, iOS, tablet)   ·   Web dashboard (later) │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / JSON · OAuth2 + passkeys
┌───────────────────────────▼─────────────────────────────────┐
│  API  (NestJS)                                              │
│                                                             │
│  identity │ accounts │ transactions │ categorization        │
│  budgets  │ goals    │ insights     │ health-score          │
│  subscriptions │ notifications │ reports                    │
└───┬────────────────────────────┬────────────────────────────┘
    │                            │
┌───▼──────────────┐    ┌────────▼─────────┐
│ PostgreSQL       │    │ Ports (adapters) │
│ records, queues, │    │ Aggregator       │
│ shared limits    │    │ Notifier         │
└──────────────────┘    │ ObjectStore      │
                        └──────────────────┘
```

## The one rule that matters

**Domain logic is pure. Infrastructure is an adapter.**

Categorization, budget arithmetic, insight derivation, and health scoring are plain
TypeScript functions over plain data. They import no framework, touch no database, and
make no network calls. Everything else — Postgres, Plaid, the LLM — sits behind
a port interface that the domain declares and infrastructure implements.

This is not architectural decoration. It buys three concrete things:

1. **The financial math is unit-testable without a database.** A budget threshold bug
   is a correctness bug in a money app. We test it in milliseconds, exhaustively.
2. **Aggregator lock-in becomes a swap, not a rewrite.** Plaid covers the US well,
   Flinks covers Canada, TrueLayer covers the UK. We will need more than one. They
   all implement `AggregatorPort`.
3. **The slice runs today without Docker.** `InMemoryStore` and `MockAggregator` are
   the same interfaces Postgres and Plaid will implement.

If you find yourself importing `@nestjs/common` inside `domain/`, stop.

## Layers

```
apps/api/src/
├─ domain/          pure functions + types. No I/O. No framework.
│  ├─ money.ts             minor-unit arithmetic
│  ├─ categorization/      rules → lexicon → (ML later)
│  ├─ budgets/             progress, thresholds, alerts
│  ├─ insights/            month-over-month, subscription detection
│  └─ health-score/        the 0–1000 score
├─ ports/           interfaces the domain needs the world to satisfy
├─ infra/           implementations: in-memory, Postgres, mock aggregator
└─ modules/         NestJS controllers + services. Thin. Wiring only.
```

Dependencies point inward. `modules → domain`, never the reverse.

## Money

**All monetary amounts are integers in the currency's minor unit** (cents, pence).
Never floats. `0.1 + 0.2 !== 0.3` is a rounding error in a spreadsheet and a support
ticket in a finance app.

Every amount carries its currency. Cross-currency totals require an explicit FX
conversion with a recorded rate and timestamp — there is no implicit addition of
different currencies, and `addMoney` throws on a mismatch rather than guessing.

Sign convention: **negative is money leaving the user.** A $4.50 coffee is `-450`.
Salary is positive. This makes cash-flow arithmetic a plain sum with no special cases.

## Categorization: three tiers, in priority order

```
1. User rules        deterministic, always wins, confidence 1.0
2. Merchant lexicon  normalized descriptor → category, confidence 0.7–0.95
3. ML classifier     (Phase 2) embeddings + gradient boosting
   └─ fallback       Unknown, confidence 0
```

A user correction does two things: it recategorizes the transaction, and it *offers to
write a rule*. Tier 1 then guarantees the app never makes that mistake again. This is
the single highest-leverage trust mechanism in the product — an app that repeats a
correction you already made feels broken regardless of its aggregate accuracy.

Bank descriptors are hostile: `SQ *BLUE BOTTLE 0093 SAN FRAN`, `AMZN Mktp US*2K4L91`.
Normalization strips processor prefixes (`SQ *`, `TST*`, `PAYPAL *`), trailing
reference numbers, store numbers, and city/state tails before matching.

## Offline-first on mobile

The Flutter client now stores successful authenticated GET responses in a
user-scoped SQLite cache. Financial payloads are encrypted with AES-256-GCM using
a random key held in the platform keystore. When the API is unreachable, reads may
fall back to a cache entry no older than 30 days and the dashboard visibly reports
the oldest timestamp in use. Sign-out and account deletion purge that user's cache.

This is intentionally read-only offline support. Mutations are not queued yet;
budgets, category corrections, goals, and bank actions continue to require the
server. A later sync journal must use server-issued versions rather than device
timestamps — device clocks lie.

This is required by the mission ("offline mode for basic features") and it is also
what makes the app feel fast enough to open daily.

## What we are deliberately not building yet

- **Kafka/RabbitMQ.** Postgres `LISTEN/NOTIFY` plus a jobs table handles our volume
  for a long time. Introduce a broker when a real throughput number demands it.
- **Microservices.** See above.
- **A hand-rolled ML model.** Tier 1 + Tier 2 gets to roughly 85% accuracy on common
  merchants. Collect corrections first; they are the training set. Build the model
  when there is data to build it from.
- **Production bank connections.** Plaid Sandbox is implemented; live institutions
  remain gated on Plaid production approval and commercial/security review. See
  [04-roadmap.md](04-roadmap.md).

## Related

- [ADR-0001](adr/0001-modular-monolith.md) — monolith over microservices
- [ADR-0002](adr/0002-pure-domain-layer.md) — pure domain, ports and adapters
- [ADR-0003](adr/0003-integer-minor-units.md) — integer money
- [ADR-0004](adr/0004-categorization-tiers.md) — rules before ML
- [ADR-0005](adr/0005-zero-knowledge-tension.md) — where zero-knowledge and AI collide
- [ADR-0006](adr/0006-row-level-security.md) — isolation enforced by the database
