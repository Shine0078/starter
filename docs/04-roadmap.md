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
- [ ] Postgres persistence adapter + migrations
- [ ] Flutter shell wired to the slice endpoints
- [ ] CI (needs `workflow` scope on the GitHub token)

**Exit:** a developer clones the repo and gets a running API with realistic seeded
data in under five minutes, on one command, with no bank involved.

## Phase 1 — Real data, one country

The first real bank connection is the hardest step in the whole plan, and almost none
of the difficulty is technical.

- [ ] Aggregator contract signed (Plaid US / Flinks CA — pick one, not both)
- [ ] Identity: passkeys, OAuth2 + PKCE, step-up auth
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

## Phase 2 — Intelligence

- [ ] ML categorizer trained on accumulated user corrections
- [ ] Conversational assistant over aggregates (zero-retention LLM contract required)
- [ ] Credit-card engine: statement/due dates, utilization alerts, safe payment window
- [ ] Financial health score surfaced with actionable steps
- [ ] Monthly report with PDF/CSV export
- [ ] Cash-flow forecasting (7/30/90 day)
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
