# Roadmap

Ordered by dependency, not by excitement. Each phase has an exit criterion you can
argue about, and the external blockers are called out because they take longer than
the code does.

## Phase 0 — Foundations *(this repo, in progress)*

- [x] Monorepo, docs, ADRs
- [x] Pure domain layer: money, categorization, budgets, insights, health score
- [x] Mock aggregator + in-memory store
- [x] Vertical slice API: import → categorize → budget → insights → score
- [x] Unit tests over the financial math
- [x] Postgres persistence adapter + migrations
- [x] Store contract suite run against both adapters
- [x] Flutter shell wired to the slice endpoints
- [x] CI workflow for API and Flutter checks (runs after the repository is pushed)

**Exit:** a developer clones the repo and gets a running API with realistic seeded
data in under five minutes, on one command, with no bank involved.

## Phase 1 — Real data, one country

The first real bank connection is the hardest step in the whole plan, and almost none
of the difficulty is technical.

- [x] Identity: email + password, Argon2id, rotating refresh tokens with reuse
      detection, global auth guard, per-account lockout, session/device
      management, security audit trail
- [x] Cross-user isolation regression tests
- [ ] **Row-level security** — isolation is enforced by application code today.
      See the note below; this is the next task.
- [ ] Email verification and password reset (both need an email provider)
- [ ] Passkeys, OAuth2 + PKCE, MFA, step-up auth
- [ ] Aggregator contract signed (Plaid US / Flinks CA — pick one, not both)
- [ ] Link flow, token storage, reauth handling
- [ ] Sync engine: cursor-based, idempotent, handles pending → posted transitions
- [ ] Merchant lexicon seeded (top ~2,000 merchants covers most volume)
- [ ] Budgets, goals, subscription detection on real data
- [ ] Flutter app: dashboard, transactions, budget, one insight surface
- [ ] Deletion + export, actually verified end to end

**External blockers — start these first, they gate everything:**

| Blocker | Typical lead time |
|---|---|
| Aggregator commercial agreement + security review | 4–12 weeks |
| Business entity, KYC/AML checks on you as a customer | 2–6 weeks |
| Apple/Google developer accounts (finance apps get extra scrutiny) | 1–4 weeks |
| Privacy counsel review of the data flows | 2–4 weeks |

Write code during these. Do not schedule as if they are instant.

**Exit:** you personally run your own finances in the app for a month and stop opening
your banking app.

### Why row-level security is its own task

Every store method already takes `userId` and every query filters on it, and
there are tests that attempt cross-user reads and writes. What is missing is the
database refusing to serve the wrong rows *even if a query forgets its filter* —
defence against a future missing `WHERE`, not against today's code.

It is not a one-line migration, which is why it is not bundled into the auth
work:

1. **Policies need a user in scope.** `current_setting('finverse.user_id')` has
   to be set per request, which means `SET LOCAL` inside a transaction — so the
   Postgres stores must route their queries through a per-call transaction
   rather than borrowing a pooled connection directly.
2. **The app must not be a superuser.** Superusers bypass RLS entirely, and both
   the docker-compose and embedded-postgres setups currently connect as one. A
   dedicated `finverse_app` role has to be created, granted, and adopted by
   `DATABASE_URL` — otherwise the policies exist but never apply, and the tests
   proving they work would pass against nothing.
3. **Only the four user-owned tables qualify.** `users`, `sessions`, and
   `auth_events` are read before a user is known (login, refresh, lockout
   counting), so they stay under application control by necessity.

Doing (1) and (2) badly is worse than not doing them: policies that silently do
not apply read as protection that is not there.

## Phase 2 — Intelligence

- [ ] ML categorizer trained on accumulated user corrections
- [ ] Conversational assistant over aggregates (zero-retention LLM contract required)
- [x] Credit-card payment planner: statement/due dates, utilization alerts, safe payment window
- [ ] Financial health score surfaced with actionable steps
- [x] User-owned ledger CSV export (formula-injection safe)
- [ ] Professional monthly PDF report
- [x] Conservative cash-flow forecasting (7/30/90 day; repeatable income and bills only)
- [x] One-off purchase simulator against the conservative cash-flow forecast
- [ ] Receipt OCR, on-device
- [ ] Fraud/anomaly detection

**Exit:** categorization accuracy above 90% on held-out corrections, and the assistant
can answer the six questions listed in `MISSION.md` without hallucinating a number.

## Phase 3 — Breadth

- [ ] Second and third country (second aggregator proves the port abstraction)
- [ ] Investment and crypto position tracking
- [ ] Family mode, shared budgets, expense splitting
- [ ] Travel mode with FX
- [ ] Business mode: tax categories, mileage, invoices
- [ ] Web dashboard
- [ ] Gamification: streaks, challenges, milestones
- [ ] Full accessibility audit (VoiceOver, TalkBack, contrast, one-handed)

## Phase 4 — The ambitious end of the mission

Everything here needs a regulatory answer before it needs an engineer.

- [ ] Bill negotiation
- [ ] Mortgage / retirement optimization
- [ ] Insurance recommendations
- [ ] Financial marketplace
- [ ] "AI financial autopilot"

**Flag on this phase:** the further right you go, the closer these get to *regulated
financial advice*. "You spent 24% more on restaurants" is an observation. "You should
move your mortgage to this lender" is advice, and in most jurisdictions advice is a
licensed activity — and a marketplace that earns referral fees creates exactly the
conflict of interest that Phase 0's privacy promise was supposed to distinguish you
from. Get a regulatory opinion before building, and decide deliberately whether
monetizing recommendations is compatible with the product you're selling.

## Sequencing advice

The mission describes roughly five years of work for a funded team. The failure mode
is building breadth before one thing is genuinely good.

**Pick the wedge.** The credit-card payment-timing engine is the strongest candidate:
it is narrow, it is a real recurring pain, it produces a number users can verify
against their own statement, and none of the incumbents do it well. It is also
achievable with less data than a full categorizer needs.

Ship that, get it right, expand outward.
