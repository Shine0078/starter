# FINVERSE research integration blueprint

Status: implemented research baseline  
Audit date: 2026-08-17  
Reference root: `C:\Users\samue\Downloads\RESEARCH FOR FINVERSCE`  
FINVERSE root: `C:\Users\samue\OneDrive\Desktop\starter`

## Purpose and boundaries

This document records a code-backed audit of the six locally available finance
applications and the decisions that are safe to adapt into FINVERSE. It is a
design and engineering reference, not a claim that FINVERSE is a derivative
work. No source files, logos, names, credentials, database dumps, or visual
assets were copied. FINVERSE remains an MIT-licensed, independently authored
NestJS + PostgreSQL API with a Flutter client.

The six repositories were inspected from their local trees, manifests,
licenses, README files, domain/service paths, persistence paths, UI/reporting
paths, and test directories. Their local dependency directories were absent,
so execution was not claimed where a toolchain installation was required.
Static evidence is recorded below rather than presenting an unverified build as
green.

## Repository inventory

| Reference | Local root | Approx. files | Test/spec files | License | Architecture evidence |
|---|---|---:|---:|---|---|
| Firefly III | `firefly-iii-main/firefly-iii-main` | 2,417 | 79 | AGPL-3.0 | Laravel/PHP app, migrations, route/controller/service boundaries, PHPUnit tests |
| Sure | `sure-main/sure-main` | 5,792 | 872 | AGPL-3.0 | Rails/PostgreSQL app with components, jobs, services, mobile/desktop clients, RSpec/Minitest |
| ezBookkeeping | `ezbookkeeping-main/ezbookkeeping-main` | 1,043 | 139 | MIT | Go server, `pkg` domain/services, Vite frontend, PWA/mobile-oriented UI, Vitest |
| Fava | `fava-main/fava-main` | 502 | 136 | MIT | Python/Flask reporting server, Beancount core adapters, Svelte frontend and chart/report tests |
| GnuCash | `gnucash-stable/gnucash-stable` | 2,718 | 299 | GPL family | C/C++/Scheme accounting engine, import/export modules, SQL/XML backends, CTest-style suites |
| Maybe | `maybe-main/maybe-main` | 1,644 | 300 | AGPL-3.0; archived | Rails wealth app with jobs, reversible imports, holdings, valuations, tags, family exports |

### Execution notes

- Firefly III and Sure require PHP/Ruby/PostgreSQL/Redis ecosystems that are not
  installed in the reference folder. Their source and tests were therefore
  inspected statically.
- ezBookkeeping requires Go and frontend package installation; its manifest,
  Go packages, frontend structure, and test configuration were inspected.
- Fava requires Python/uv and frontend dependencies; `pyproject.toml`, core
  modules, Svelte components, and tests were inspected.
- GnuCash is a native CMake project with a large system dependency surface; the
  build was not attempted from this Windows workspace.
- Maybe and Sure contain vendored Rails support but no installed JavaScript
  dependencies in the downloaded trees; their Rails models, jobs, controllers,
  import pipeline, and tests were inspected.

## Comparison matrix

| Concern | Strongest observed pattern | FINVERSE decision |
|---|---|---|
| UI/navigation | Sure's coherent product surface; ezBookkeeping's responsive desktop/mobile/PWA split | Keep one FINVERSE Flutter design system. Use bottom navigation on phones and a rail on larger screens. |
| Dashboard | Sure/Maybe wealth overview and Fava drill-through reports | Keep the existing net-position hero, cash-flow, health, budget, insight, and transaction sections; add actions that route to real screens. |
| Theme/design | ezBookkeeping's explicit dark mode and Sure's tokenized design folder | Persist semantic light/dark mode and accent color through `ThemeModeController`/`ThemeColorController`; avoid per-widget hard-coded colors. |
| Accounting | GnuCash split transactions and balanced ledger; Beancount concepts surfaced through Fava | Preserve provider facts and integer minor-unit amounts. Add evidence layers such as reconciliation assertions before a ledger rewrite. |
| Categorization | Firefly rule groups; Sure/Maybe enrichment and user overrides; ezBookkeeping templates | Keep deterministic normalization, confidence, user corrections, and rule backfill. Future rules must be previewable and ordered. |
| Import | Maybe's staged upload/mapping/clean/confirm/revert workflow; ezBookkeeping's broad format support | Build a review boundary first: upload, map, validate, duplicate-confidence preview, atomic commit, reversible provenance. Do not silently import rows. |
| Reconciliation | Sure/Maybe valuation entries and GnuCash reconciliation state | Record observed balance/date/source as an auditable assertion. Never rewrite provider transactions to make a balance agree. |
| Tags/search | Firefly, Maybe, and transaction API paths in Sure | Add user-owned tags and saved filter views after the transaction contract has tag fields; enforce user isolation in both stores and RLS. |
| Recurrence | Firefly recurring templates; Maybe/Sure scheduled jobs; FINVERSE detection | Keep detected recurrence separate from a user-approved scheduled obligation. A future scheduler must be explicit and previewable. |
| Investments | Sure/Maybe holdings, securities, trades, prices, valuations | Keep investment positions separate from transaction categories. Never invent a price; label stale or missing prices. |
| Analytics | Fava's filterable reports and chart modes; ezBookkeeping custom query/chart dimensions | Use one API calculation layer, expose filters/date/currency, and pair every chart with an accessible table or spoken summary. |
| Security | ezBookkeeping 2FA/OIDC/rate limits; FINVERSE's existing keystore, MFA, WebAuthn, RLS, breach checks | Preserve least privilege and RLS. Do not import a reference authentication implementation or store provider secrets on-device. |
| Background work | Sure/Maybe jobs and cleanup; ezBookkeeping scheduled operations | Keep sync cursor-based and best-effort, surface job health, and make retries idempotent. |
| Testing | GnuCash/Fava broad domain suites; Sure's model/service coverage; FINVERSE's store contracts and Flutter tests | Add pure deterministic tests at domain boundaries, store contract tests, RLS/deletion tests, and widget accessibility semantics. |

## Findings by project

### Firefly III

The README explicitly identifies budgets, categories, tags, external imports,
reports, recurring transactions, and rule-based transaction handling. The code
tree confirms separate transaction rule engines, recurrence validation/factories,
search request/controller paths, factories, and PHPUnit tests.

Transferable concepts:

- ordered trigger/action rules with a dry-run explanation;
- tags as a second organization axis rather than replacing categories;
- scheduled obligations distinct from historical recurrence detection;
- report filters that preserve the user's selected period.

Not transferred: Laravel/AGPL source, Firefly branding, or its database model.

### Sure

Sure is the broadest local tree. `app/models`, `app/jobs`, `app/components`,
`app/controllers`, `db`, `mobile`, `desktop`, `charts`, and `design/tokens`
show a wealth-oriented product with reconciliation/valuation, imports,
holdings, prices, family membership, rules, background jobs, and responsive
presentation. The README identifies it as a community AGPL fork of Maybe and
explicitly warns about attribution/trademark obligations.

Transferable concepts:

- reconciliation as an explicit valuation/evidence entry;
- staged import and reversible bulk operations;
- family/membership authorization below the controller layer;
- performance instrumentation and background-job health;
- semantic design tokens rather than a collection of page-specific styles.

Not transferred: AGPL source, Maybe/Sure trademarks, external providers, or
their production credentials.

### ezBookkeeping

The README and tree show a lightweight Go server, Vite frontend, PWA/mobile
support, dark mode, scheduled transactions, attachments, search/filter/chart
analysis, multi-currency exchange-rate providers, 2FA/OIDC/rate limiting, and
CSV/OFX/QIF/IIF/CAMT/MT940/GnuCash/Firefly/Beancount import/export paths.

Transferable concepts:

- format adapters behind one import-review contract;
- saved transaction templates for manual accounts;
- explicit FX provider/source and manual override provenance;
- mobile/desktop behavior sharing validation and state;
- PWA-friendly empty, loading, and offline states.

Not transferred: code or UI assets; FINVERSE keeps its Flutter and NestJS
architecture.

### Fava

Fava's Python core separates account, journal, holdings, documents, query,
errors, statistics, balance-sheet, income-statement, and trial-balance reports.
The Svelte frontend contains typed entry models, tree tables, filters, editors,
and chart/report tests. Its key lesson is traceability: a report filter and
chart should lead back to the entries behind the number.

Transferable concepts:

- shareable filter state and chart/table alternatives;
- visible data-quality/error report;
- document links from a financial row;
- accessible table equivalents for visual reports.

### GnuCash

GnuCash's CMake tree separates engine, register, reports, SQL/XML backends,
import/export (QIF, OFX, CSV, customer import), scheduled transactions, price
quotes, tax, and bindings. The accounting engine and tests reinforce balanced
splits, reconciliation, import matching, lots, and cost/price history.

Transferable concepts:

- split/reconciliation invariants;
- confidence-ranked matching that asks for review when evidence is weak;
- scheduled transaction templates with reminders;
- price/lot provenance for investment features.

Not transferred: native source, GPL-linked components, or a desktop rewrite of
FINVERSE.

### Maybe Finance

Maybe is explicitly archived. Its Rails tree still provides useful evidence:
family-scoped data, tags, bulk transaction updates, staged imports with
mapping/clean/confirm controllers, reversible import jobs, holdings, valuations,
market-data import, rules, and data export. The local source itself records the
maintenance warning; breadth without sustainable ownership is a product risk.

Transferable concepts:

- import/revert as a first-class workflow;
- household export portability;
- transfers separate from income/expense;
- valuation evidence and tag management.

Not transferred: archived AGPL code, Maybe trademark, or its business model.

## FINVERSE audit

Current FINVERSE evidence:

- API: NestJS, TypeScript, PostgreSQL adapters, in-memory contract adapter,
  21 numbered migrations, RLS policies, auth/MFA/WebAuthn, Plaid adapter,
  billing ports, receipts, push, shared expenses, budgets, goals, insights,
  forecast/report endpoints, and privacy export/deletion flows.
- Mobile: Flutter screens for dashboard, analytics, transactions, budgets,
  goals, planning/calendar, subscriptions, bank connections, receipts,
  categorization rules, shared expenses, profile/settings, onboarding, and
  accessibility-aware charts.
- Financial safety: integer minor units, explicit currency on amounts,
  normalized and raw descriptors, user overrides, idempotent provider sync,
  deterministic search/categorization, net-worth snapshots, account-scoped
  data, encrypted offline cache, secure session storage, RLS tests, and export
  / deletion tests.
- Verification surface: 49 API test files, 11 Flutter test files, CI workflows
  for app/database/release/uptime, and 300 Git commits at the audit point.

The most important gap is not another dashboard tile. It is the missing review
boundary around user organization and imported evidence: tags/saved views,
reconciliation assertions, and a staged import center are the next compatible
vertical slices. They must preserve provider facts and be covered by both the
in-memory and PostgreSQL store contracts.

## Implemented from this blueprint

The first vertical slice is now in the product rather than only on the roadmap:

- `022_transaction_tags.sql` adds bounded, user-owned labels and a GIN index.
- Both the in-memory contract adapter and PostgreSQL adapter preserve labels on
  provider re-sync, filter by exact normalized tag, and keep user scope intact.
- `PATCH /api/transactions/:id/tags` validates and replaces a transaction's
  labels; `GET /api/transactions?tag=...` exposes the saved-view building block.
- CSV export includes a portable pipe-delimited `tags` column.
- Flutter transaction rows show a label badge and transaction details provide a
  comma-separated tag editor with offline mutation replay.
- Pure normalization and isolation tests cover deduplication, bounds, search,
  user separation, and preservation across sync.

This deliberately starts with a small, reversible organization feature. Saved
views can now be built on the same query contract without adding a second copy
of filtering logic.

### Slice 2 — account reconciliation assertions

The GnuCash/Sure/Maybe lesson applied: reconciliation is *evidence*, never a
correction.

- `023_account_reconciliations.sql` stores the observed balance, the balance
  FINVERSE derived for that date, and the difference between them, under RLS.
- Historical balances are reconstructed rather than stored. The provider gives
  one balance — the balance now — so `computeBalanceAsOf` unwinds settled
  transactions posted since. Pending rows are excluded because the provider's
  `current` balance never included them.
- `computed_balance` is frozen at assertion time. Recomputing it on read would
  silently rewrite history as later transactions arrive, and the record exists
  to say what we believed *then*.
- There is no tolerance band. Within one currency the arithmetic is exact, so a
  one-cent gap is a real one-cent gap; a "close enough" threshold would hide the
  small systematic errors that are hardest to find later. Reconciling across
  currencies is refused rather than converted at an invented rate.
- A second observation of the same closing date supersedes the first — a
  correction, not a contradicting second fact. Withdrawal archives rather than
  deletes: an audit trail you can erase is not one.
- `GET /api/reconciliations/preview` is side-effect-free, so a user sees the
  comparison before committing. The Flutter screen follows the same
  preview-then-record shape and never alters the ledger.

Explicitly **not** adopted from the references: GnuCash's balancing-entry
insertion. Writing an adjusting transaction to force agreement destroys the
discrepancy the user needed to investigate.

### Slice 3 — saved transaction views

Completes the organization axis begun with tags. A view is a named
`TransactionQuery` and nothing more, so applying one routes through the same
store method the live list uses; there is no second filtering implementation for
a saved view to drift away from. The filter persists as explicit columns rather
than a JSON blob, because a blob accepts keys the query layer silently ignores —
a saved view could stop meaning what the user set without anything failing.

### Slice 4 — staged CSV import review

Maybe's upload → map → clean → confirm → revert workflow, adapted.

- **Nothing enters the ledger unseen.** `POST /api/imports/preview` parses,
  infers a mapping, and classifies every row as import, duplicate, or invalid
  with a reason, writing nothing.
- **No row is silently dropped.** An unreadable row appears in the preview with
  its real line number. Discarding rows from a bank export is how money goes
  missing without anyone noticing.
- **Ambiguity is reported, not guessed.** `03/04/2026` is 3 April or 4 March;
  the order is inferred only when a value above 12 proves it, and otherwise the
  review must confirm. Amounts that cannot be read return null rather than zero.
- **Three amount conventions**, because banks disagree: a signed column, a
  debit/credit pair, and a positive amount with a direction column.
- **Duplicate detection** requires an exact amount match, then scores date
  proximity and descriptor similarity. It deliberately does not require an exact
  descriptor: banks reformat those between a CSV export and the provider feed,
  so an exact rule would let every re-import duplicate the ledger.
- **Reversible.** `025_import_batches.sql` adds a nullable `import_batch_id` to
  the transaction. A revert deletes by batch id, so it can never remove a
  provider-synced row, and the batch survives marked reverted.

Explicitly **not** adopted: an import that merges silently on the grounds that
duplicate detection is good enough. It never is, and the failure is invisible.

### Slice 5 — scheduled obligations

Firefly III's recurring templates and Maybe's scheduled jobs, with the
distinction the blueprint insisted on: a schedule is what the user *committed
to*, kept separate from the recurrence the subscription engine *detects* from
history. Conflating them means either a detection error invents a commitment
nobody made, or a real commitment vanishes the month a charge is missed.

It is also a separate table from `transactions`, not a flag on one. A commitment
is about the future; a transaction is a fact about the past. Storing a future
obligation as a transaction row would put money that has not moved into every
balance, budget and cash-flow total — there is a test asserting that creating a
schedule writes no transaction.

Monthly and longer cadences advance in calendar months anchored to the start
day, with the clamp applied to the derived date rather than carried forward. A
bill due on the 31st therefore falls on the 28th in February and returns to the
31st in March, instead of migrating permanently.

### Slice 6 — dated FX rates

The blueprint said to add these "only when source/provider provenance is
available". A user-supplied rate with a date and a stated source satisfies that,
so the long-standing refusal to combine currencies is now conditional rather
than absolute.

- The most recent rate **on or before** the conversion date is used, never a
  later one — a future rate would restate yesterday's net worth overnight.
- A direct rate beats a newer inverse one, because the direct figure is what the
  user recorded and inverting introduces error.
- A currency with no rate is **excluded and named**. `incomplete` and `missing`
  are part of the response contract, because a total that quietly omits an
  account looks finished and is not.

Still **not** adopted: any automatic rate feed. That needs a provider agreement,
and an unattributed rate is exactly what this design refuses.

### Slice 7 — rule dry-runs and reversible bulk apply

Firefly III's most valuable rule-engine property: seeing what a rule would do
before it does it. The preview separates *matched*, *will change*, *already
correct* and *protected by user choice* — a rule that changes nothing because it
is already satisfied and one that changes nothing because the pattern is a typo
look identical without those counts.

A category the user set by hand is never overruled. Migration 027 records the
previous category, source and confidence of every changed row, because an undo
needs to know what each row was before and that is not recoverable from the rule.

### Slice 8 — reporting over a saved view

Reuses the same query path as the live transaction list and the same
`summarizePeriod` as every other total. A report that recomputed its own figures
would eventually disagree with the dashboard and the user could not tell which
was right; a test asserts a view and the equivalent live query return the same
rows.

Fava's traceability, made concrete: every chart ships with the identical numbers
as a table and one sentence a screen reader can announce instead of it.

## Integration sequence

1. Keep the current responsive dashboard, semantic theme system, and accessible
   chart/table pairs as the product shell.
2. ~~Add transaction tags and saved views with user isolation, export inclusion,
   and mobile management.~~ **Done** — tags and saved views both landed; mobile
   management exists for tags, and saved views are API-only so far.
3. ~~Add account reconciliation assertions with observed balance/date/source,
   calculated difference, history, and undo/archive semantics.~~ **Done** — see
   the slice notes above.
4. ~~Add CSV/OFX import review: upload, map, validate, duplicate confidence,
   preview, atomic commit, provenance, and reversible rollback.~~ **Done for
   CSV** — see the slice notes above. OFX/QIF adapters can now be added behind
   the same review contract without touching the commit or revert paths.
5. ~~Add scheduled manual transaction templates and explicit reminders.~~ **Done.**
6. ~~Add dated FX rates and investment holdings only when source/provider
   provenance is available.~~ **Done for FX rates.** Investment holdings remain
   out: positions need a price feed, and this design refuses an unattributed price
   for the same reason it refuses an unattributed rate.
7. ~~Add advanced rule dry-runs and reversible bulk operations.~~ **Done.**
8. ~~Add shareable web reporting filters that reuse the existing API
   calculations.~~ **Done** — API-side. A web UI to surface them is product work,
   not integration work.

**The integration sequence is complete.** What remains from the research is
deliberately excluded rather than pending: investment holdings (needs a price
feed), an automatic FX feed (needs a provider), and a full double-entry rewrite
(explicitly rejected below).

Every slice must pass: pure money logic, no implicit currency mixing, no
provider-fact destruction, user/membership isolation in both stores, RLS and
deletion/export coverage, accessible mobile behavior, and production-config
review before enabling an external provider.

## Explicit non-adoptions

- No AGPL/GPL implementation or copied UI assets are added to the MIT project.
- No full double-entry rewrite is performed before a compatibility/evidence
  layer proves its value.
- No cross-currency net worth number is shown without a dated, sourced FX rate.
- No autonomous financial advice is introduced; summaries and simulations are
  informational and require legal/regulatory review before recommendations.
- No commercial provider credential is committed or inferred from a reference
  project.
- No commit-count inflation is allowed. FINVERSE already exceeds 100 commits;
  the implementation log records the actual history rather than manufacturing
  placeholders.

## Verification record

Re-measured after the reconciliation slice (2026-08-17):

| Gate | Result |
|---|---|
| API tests, real PostgreSQL | 970 passed |
| `tsc --noEmit` and `npm run build` | clean |
| `flutter analyze` | clean |
| Flutter test suite | 108 passed |
| Git history | 320 commits |

An earlier version of this section recorded 102 Flutter tests and referred to
the API suite only as "exercised by CI". Both counts above were produced by
running the suites on this workstation.

Reference projects were not falsely marked as built because their required
toolchains/dependencies were not installed in the download directory. The
static findings above are the evidence used for integration decisions.
