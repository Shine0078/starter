# MISSION2 audit and delivery plan

MISSION2 asks for the audit first (§43, and Phase 1 of the appended re-audit),
before any redesign. This is that audit, written by reading the code rather than
the previous documents, plus an honest accounting of what has been delivered
against it and what has not.

**Scope reality check.** MISSION2 is 45 sections plus 20 phases: a design
system, four rebuilt screens, a transaction pipeline, six analytics engines, an
insight engine, caching and an event-driven update pipeline. That is a multi-
month programme, not a single change. This document tracks it honestly rather
than reporting a redesign that has not happened.

---

## 1. Audit findings (§43)

### Existing Flutter architecture

| Aspect | Finding |
|---|---|
| Screens | 12, feature-complete for the current API surface |
| State management | `setState` only. §43.3 — honest at one screen, straining at twelve. The single largest structural obstacle to §13 (optimistic UI) and §39 (event-driven updates) |
| Reusable components | `widgets/` has `budget_tile`, `health_score_card`, `net_position_card`, `spending_chart`, `transaction_tile`. Genuinely reusable; keep |
| Design system | **None.** Spacing, colours and typography are inline per screen. §2 asks for one and it does not exist |
| Navigation | 5 bottom tabs (Home, Transactions, Budgets, Goals, Accounts). §3 asks for 4 (Home, Transactions, Analytics, Accounts) — Analytics does not exist |
| Loading states | `CircularProgressIndicator` everywhere. §33 asks for skeletons |
| Error states | A red card with `error.toString()`. §34 asks for actionable recovery |
| Empty states | Present on most screens, but do not distinguish the five cases §3 of the re-audit requires |

### Transaction pipeline

| Stage | State |
|---|---|
| Ingest | Cursor-based Plaid `/transactions/sync`, all pages drained, bounded at 100. Mutation-restart handled. **Solid** |
| Idempotency | Unique on `(user_id, account_id, provider_txn_id)`. **Solid** |
| Normalisation | `normalize.ts` strips processor prefixes, reference numbers, store numbers. **Good**, and its bug history is documented |
| Categorisation | Rules → lexicon → unknown. No ML. §16 satisfied in shape, §31 (AI layer) not started |
| User rules | Correction writes a tier-1 rule and backfills. §17 **satisfied** |
| Internal transfers | **Was missing. Now implemented** — see §2 below |
| Refund matching | **Missing** (§19) |
| Duplicate detection | Partial — exact recent duplicates prompt; no fuzzy matching (§20) |
| Recurring | `subscriptions.ts` detects fixed recurring charges with interval clustering. §21 largely satisfied |

### Analytics

| Engine | State |
|---|---|
| Expense (§22) | Month-to-date vs comparable previous window, per category. Present |
| Income (§23) | Thin. Totals only; no stability or source analysis |
| Savings (§24) | Rate computed in the health score; not a standalone engine |
| Spending velocity (§25) | **Missing** |
| Financial timeline (§26) | **Missing** |
| Cash flow (§16 of re-audit) | Conservative 7/30/90 forecast from repeatable income and bills. Present and tested |
| Analytics screen (§27) | **Missing entirely** |

### Duplicated calculations (§43.7)

Currency formatting is derived server-side and sent alongside every amount, so
the client never re-derives it — deliberate, and correct. No duplicated
financial arithmetic found between client and server. The domain layer is the
single source, as ADR-0002 requires.

### Performance (§43.8, §36)

Measured, not guessed:

- API p95 **229 ms** at 250 requests / concurrency 10 (CI smoke gate: 750 ms).
- Web bundle **918 KB** gzipped after compression was added; it was 3.1 MB raw,
  which is what made the app feel stuck on a phone.
- Transaction list has **no pagination** — `?limit=` only. §14 requires it, and
  it is the clearest scaling cliff in the product.
- No analytics cache (§38). Every dashboard load recomputes from raw rows.

### Bank synchronisation (§43.9)

Working against Plaid Sandbox, with reauth, a durable webhook retry queue, and
encrypted token storage. Now also works from the browser (Plaid Link for Web),
which is what makes it usable on an iPhone without a Mac.

---

## 2. Delivered against MISSION2

Ordered as §44 requires.

### §44.1 — Audit ✅
This document.

### §44.3 / Phase 3 — Remove fake data ✅ (partial)
The developer dashboard, whose Sync button fabricates ~183 transactions from
`MockAggregator`, moved from `/` to `/dev/`. The root now redirects to the real
app. `POST /api/sync` was already refused under `NODE_ENV=production`.

**Still outstanding:** the mock is reachable by a logged-in user on a non-
production deployment. Phase 3 wants it behind an explicit demo mode, and the
five-state empty/loading/error distinction is not implemented.

### §44.7 / Phase 10 — Do not miscount transfers ✅
`domain/transactions/internal-transfers.ts`, 11 tests.

Moving $500 from chequing to savings previously counted as $500 of spending
**and** $500 of income, corrupting the savings rate, category totals, cash-flow
forecast and health score simultaneously — with no error anywhere. Category-
based exclusion existed but only fired when a descriptor matched the lexicon,
which real bank strings ("e-Transfer", "WITHDRAWAL", "DEPOSIT REF 88213")
routinely do not.

Detection pairs on the shape of the movement: equal and opposite amounts, same
currency, different accounts, within three days. Deterministic regardless of row
order, never pairs one transaction twice, ignores pending rows, and never
overrides a category the user set. Runs after all pages are synced, because the
two sides routinely arrive in different pages or from different institutions.

Deliberately under-detects rather than over-detects: a missed transfer overstates
spending in a way the user can see and correct, while a false pair silently
deletes a real expense from their totals.

### §2 — Design system ✅ (foundation) / ⏳ (adoption)

`lib/design/` — tokens, semantic colours, typography, theme, components, and a
single `design.dart` barrel. 12 tests.

What it settles, once, instead of per screen:

- **Money is set in tabular figures.** By default digits have proportional
  widths, so a 1 is narrower than a 0 and a column of amounts wobbles. This is
  the cheapest change in the system and the most visible: it is the difference
  between a ledger and a paragraph.
- **Direction is never colour alone.** `MoneyText` carries an explicit `+`/`−`
  and `FinMetricTile` pairs every trend colour with an arrow, because roughly
  one man in twelve cannot separate red from green (§41).
- **Money reads aloud correctly.** "−$4.50" is announced as "$4.50 out", not as
  punctuation.
- **Sign and meaning are separated.** `TrendMeaning` exists because spending
  £200 less is a negative number and good news, while earning £200 less is a
  negative number and bad news.
- **Semantic colours, not literal ones.** `income`/`expense`/`warning` via a
  `ThemeExtension`, with a dark palette that is lifted in lightness and pulled
  back in chroma rather than the light one dimmed — saturated red and green
  vibrate and fail contrast on a dark surface.
- **Skeletons, empty states, error states, stale banner** (§33–35), including a
  shimmer that genuinely stops under reduced motion rather than merely hiding.
- **48dp minimum tap target** on every button.

**Adoption is partial and that is the honest status.** The theme is applied app-
wide, and the dashboard's loading and error states now use it. The remaining
eleven screens still carry inline padding and colours; converting them is
mechanical but not yet done.

### Supporting work
- Persistent local PostgreSQL, so data survives a restart.
- `.env` is now actually loaded — `.env.example` had promised this and nothing
  read it.
- Manual accounts accept `credit_card`, which unblocked the entire credit-card
  surface for anyone without a bank connection.
- Plaid Link for Web, so bank connection works on iPhone.

---

## 3. Not yet delivered

Honest list, in §44 order. None of this is started unless stated.

| §44 | Item | Notes |
|---|---|---|
| 2 | Stabilise sync | Largely already solid; needs production-load evidence |
| 4 | Normalisation improvements | Current engine is good; §15's full spec is broader |
| 5 | Pagination, search, filtering | **No pagination exists.** Highest-value remaining backend work |
| 6 | Analytics domain layer | Partial. Velocity, timeline, income depth missing |
| 8 | New transaction UI | Not started |
| 9 | Redesigned dashboard | Not started |
| 10 | Analytics section | Not started — a whole screen |
| 12 | Refund/duplicate intelligence | Refund matching missing |
| 13 | Insight engine | `insights.ts` exists; §29–30 prioritisation does not |
| 14 | Caching and performance | No analytics cache |
| §2 | Design system | Foundation built; **11 of 12 screens not yet converted** |
| §41 | Accessibility | Partial — the design system covers contrast, targets, semantics and reduced motion |

### Recommended next three

1. **Convert the remaining screens to the design system.** Mechanical, and
   until it is done the app still looks assembled from twelve opinions.
2. **Pagination + filtering** (§14, §9). Everything else in the transaction UI
   sits on top of it, and it is the one existing scaling cliff.
3. **Analytics domain layer, then the Analytics screen** (§22–27). Biggest
   visible gap against the brief.

State management (§43.3) should be resolved during (1), not after it: converting
a screen is the moment its state handling is already open.

---

## 4. The completion test (§45)

Where the current system stands against the scenario MISSION2 defines:

| Step | State |
|---|---|
| Opens to cached overview | ❌ No analytics cache; recomputed each load |
| Background sync | ⚠️ Webhook-driven and manual; no background scheduler |
| Imports new transaction | ✅ |
| Prevents duplication | ✅ Idempotency key |
| Normalises merchant | ✅ |
| Categorises | ✅ |
| Updates monthly spending, categories, cash flow | ✅ Recomputed on read |
| Updates dashboard, analytics, feed | ⚠️ On refresh, not reactively |
| Remembers a correction and updates analytics | ✅ Rule written and backfilled |
| Second bank merges without double-counting transfers | ✅ **As of this work** |

The last row was the one that was outright wrong. It is now correct and tested.
