# Open-source finance application pattern audit

Date: 2026-08-16

## Scope and method

This is a structural and product audit, not a claim that every source line was
manually reviewed. For each reference repository, the audit inspected the full
tracked file tree at one pinned commit, its license, build layout, domain models,
services, persistence, import/export paths, reporting UI, and representative
tests. Feature-path counts were used only to find concentrations of code; they
are not quality scores.

FINVERSE remains independently implemented. No source was copied. This is
especially important because several references use strong copyleft licenses
that are not compatible with silently incorporating their code into FINVERSE's
MIT codebase.

| Project                                                                                                  | Commit inspected | Approx. tracked files | License            | Primary lesson                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ---------------: | --------------------: | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Firefly III](https://github.com/firefly-iii/firefly-iii/tree/fd8791d08d4d9e6467519a78048cd038e26b8878)  |        `fd8791d` |                 2,453 | AGPL-3.0           | Rules, recurring transactions, tags, goals, currencies, and reports form distinct product systems.                                         |
| [Sure](https://github.com/we-promise/sure/tree/9e90f7c60d7a19ad548c1ffc034afdbe1d0f301d)                 |        `9e90f7c` |                 5,789 | AGPL-3.0           | Wealth management needs reconciliation, import staging, holdings, valuations, sharing, and observable background jobs.                     |
| [ezBookkeeping](https://github.com/mayswind/ezbookkeeping/tree/994461f44fcf9974d7e89ce35fed3c73708d4927) |        `994461f` |                 1,032 | MIT                | A small deployment can still provide strong imports, templates, tag groups, reconciliation, and pluggable FX sources.                      |
| [Beancount](https://github.com/beancount/beancount/tree/a3cb3fd9f946d6213dd350fb87709a8ef198301d)        |        `a3cb3fd` |                   340 | GPL-2.0 only       | Invariants, balance assertions, validation passes, lots, and immutable audit evidence matter more than UI cleverness.                      |
| [Fava](https://github.com/beancount/fava/tree/ba6950b0271fa420835af9141bc65a6fef1dd955)                  |        `ba6950b` |                   502 | MIT                | A finance UI becomes powerful when filters are shareable, charts are switchable, and every report drills into the ledger.                  |
| [GnuCash](https://github.com/Gnucash/gnucash/tree/0de89eecba0c3ae8581bd149412d989c696bdd8b)              |        `0de89ee` |                 2,718 | GPL family         | Splits, reconciliation state, scheduled transactions, probabilistic import matching, invoices, and lots are durable accounting primitives. |
| [Maybe Finance](https://github.com/maybe-finance/maybe/tree/77b5469832758d1cbee1a940f3012a1ae1c74cd3)    |        `77b5469` |                 1,644 | AGPL-3.0, archived | Its family, import, valuation, tags, and portfolio ideas remain useful, but Sure is the maintained successor.                              |

Commit IDs are recorded so this audit remains reproducible even when a default
branch changes. Repository sizes and feature sets will change after this date.

## What each codebase teaches FINVERSE

### Firefly III

Firefly's model boundary treats tags, categories, bills, budgets, rules,
recurrences, piggy banks, exchange rates, audit entries, and webhooks as
first-class resources. Its rule engine separates ordered triggers from actions,
and recurring transactions keep their schedule and transaction template apart.

Useful ideas:

- graduate FINVERSE's single merchant-to-category rule into an ordered,
  previewable trigger/action system;
- add reusable transaction tags without changing the bank-provided category;
- model scheduled obligations explicitly rather than relying only on historical
  recurrence detection;
- retain dated, sourced FX rates instead of silently combining currencies;
- make every automation explain what matched and what it changed.

### Sure

Sure is the broadest reference. Its current tree separates balance series,
balance sheets, account statements, reconciliation, imports, holdings, security
prices, trades, goals, family sharing, provider connections, rules, assistant
tools, and job health. A particularly useful control is reconciliation through
an explicit valuation entry: correcting today's balance does not rewrite the
historical transaction ledger.

Useful ideas:

- add statement import as a staged workflow: upload, detect metadata, map an
  account, preview rows, resolve duplicates, then commit or revert;
- represent a balance correction as auditable evidence, not a destructive edit;
- make investment positions derive from holdings, trades, prices, and cash
  rather than storing only one account balance;
- scope assistant capabilities as narrow tools with explicit data access;
- expose background sync health and cleanup status to operators;
- keep shared-finance authorization based on membership, with invitations and
  least-privilege roles.

### ezBookkeeping

ezBookkeeping demonstrates how much utility can fit in a comparatively small
self-hosted application. It has transaction templates, tag groups, account
reconciliation screens, custom and central-bank exchange-rate providers, and a
large converter layer for CSV, JSON, OFX, QIF, CAMT, Beancount, GnuCash, and
regional payment exports.

Useful ideas:

- prioritize a safe import center before adding another banking aggregator;
- let users save transaction templates for cash and manual accounts;
- provide a provider interface for FX rates with manual overrides and recorded
  provenance;
- share validation and state between phone and desktop layouts;
- make import mappings reusable while keeping a mandatory preview.

### Beancount

Beancount is a compact accounting engine built around typed directives and
validation. Balance assertions, booking, inventories, prices, lots, tags,
links, documents, and plugins are separate passes over immutable entries.

Useful ideas:

- add explicit assertions such as "this account was 1,245.67 CAD on this date";
- run financial integrity checks as named, explainable validators;
- retain source evidence and corrections instead of overwriting facts;
- use tags for user meaning and links for relationships such as refunds,
  reimbursements, transfers, and receipts;
- treat investment lots and cost basis as a dedicated domain, not transaction
  category extensions.

### Fava

Fava layers a focused reporting experience over Beancount. Its UI contains
account, journal, holdings, documents, query, errors, statistics, balance-sheet,
income-statement, and trial-balance reports. Filters live in URL-compatible
state, and charts can switch among line, bar, scatter, sunburst, treemap, and
hierarchical views.

Useful ideas:

- make filters persistent and shareable, then let every chart drill into the
  exact transactions behind a point;
- allow users to switch visualization only when the underlying measure supports
  it, rather than creating unrelated dashboard widgets;
- add a visible data-quality/errors report beside financial reports;
- connect documents to accounts and transactions with one consistent viewer;
- build the full web dashboard from the same API contracts, not a second set of
  financial calculations.

### GnuCash

GnuCash provides the deepest accounting reference. Transactions contain one or
more account splits, and balanced value is the central invariant. Its import
design assigns match confidence using provider IDs, amount, memo, and date,
then asks the user to choose when evidence is not certain. Scheduled
transactions store templates, schedules, start/end dates, remaining
occurrences, auto-create behavior, and reminder lead times.

Useful ideas:

- add split transactions without replacing the provider transaction record;
- use confidence-ranked duplicate/import matching and never auto-merge weak
  matches;
- support reconciliation states and dates;
- make scheduled transactions previewable and optionally auto-created;
- implement invoices, receivables, payables, and tax reports only inside a
  clearly separated business mode;
- use lots and price history for investments.

### Maybe Finance

Maybe is archived and largely superseded by Sure, but it clearly demonstrates
the value of family-scoped data, reversible imports, tags, rules, holdings,
market prices, valuations, transfers, and portable family exports. Its archived
status is also a product warning: a broad feature surface and polished code do
not by themselves make a sustainable consumer-finance business.

Useful ideas:

- keep bulk imports reversible;
- make the complete household dataset portable;
- separate transfers from income and expenses;
- use the maintained Sure fork for future comparisons rather than adding new
  dependencies on archived code.

## Cross-project consensus

The most reliable ideas are the ones that recur across unrelated architectures:

1. **The ledger must remain auditable.** Imports, user edits, reconciliation,
   and automation should add evidence or explicit overrides rather than erase
   provider facts.
2. **Organization is multi-dimensional.** Categories answer "what kind?";
   tags answer "why/for whom?"; links answer "what is this related to?".
3. **Imports require a review boundary.** Mapping, normalization, duplicate
   confidence, preview, commit, and rollback are a product—not a CSV endpoint.
4. **Currencies need provenance.** Every conversion needs a date, rate, source,
   direction, and original amount.
5. **Planning needs explicit future objects.** Detected subscriptions are not a
   substitute for scheduled bills, templates, reminders, and known changes.
6. **Wealth needs positions and prices.** One investment-account balance cannot
   explain holdings, cost basis, gains, or stale prices.
7. **Reports must be traceable.** A chart should lead to the included ledger
   rows and state its filters, currency, and date range.
8. **Shared finance changes the security boundary.** Household membership and
   roles must be enforced below controllers, ideally by database policy.

## FINVERSE gap map and recommended order

### Implemented in the dashboard pass

The first UI pass applies the recurring navigation lessons without copying any
reference code: phones keep a thumb-friendly bottom bar, tablet and desktop
widths switch to a persistent navigation rail, and the dashboard exposes a
small action center for account setup, transaction review, cash-flow planning,
and reports. The actions route to the existing screens and API contracts, so
there is one source of truth for balances and calculations.

FINVERSE already has a strong pure domain layer, integer minor-unit money,
currency-separated analytics, bank sync idempotency, preserved raw descriptors,
user overrides, categorization rules, budgets, goals, recurring detection,
forecasts, reports, receipt links, net-worth history, and PostgreSQL RLS.

The next original implementation sequence should be:

| Priority | FINVERSE capability                     | Why now                                                                                                            | Acceptance boundary                                                                                                    |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| P0       | Transaction tags and saved views        | Common to Firefly, Sure/Maybe, ezBookkeeping, and Beancount/Fava; adds organization without corrupting categories. | Per-user tags, color validation, assign/remove, tag filtering, search, export, RLS, deletion proof, mobile management. |
| P0       | Account reconciliation assertions       | The strongest control from Sure, Beancount, ezBookkeeping, and GnuCash.                                            | Record observed balance/date/source, calculate difference, never rewrite provider ledger, history, undo, RLS.          |
| P0       | Import review center                    | More useful for global coverage than pretending one aggregator covers every institution.                           | CSV/OFX first, column mapping, validation, duplicate confidence, preview, atomic commit, rollback, provenance.         |
| P1       | Scheduled manual transactions/templates | Converts recurring detection into planning and supports cash users.                                                | Template, cadence, next date, reminders, preview, skip, explicit auto-create choice.                                   |
| P1       | FX ledger and travel workspace          | Required before combined multi-currency reporting or travel mode.                                                  | Dated source rates, manual override, original amount retained, conversion explanation, trip budget/report.             |
| P1       | Investment positions                    | Required for meaningful wealth management.                                                                         | Security identity, holdings, trades, prices, stale-price labels, cost basis method, no invented prices.                |
| P2       | Advanced rule builder                   | High leverage after tags and imports exist.                                                                        | Multiple conditions/actions, ordering, dry run, conflict explanation, bounded regex.                                   |
| P2       | Reversible bulk actions                 | Needed once imports and richer rules land.                                                                         | Preview count, confirmation, audit record, bounded batches, undo where safe.                                           |
| P2       | Web reporting workspace                 | Fava's strongest lesson, but should reuse stable APIs.                                                             | Shareable filters, drill-down, accessible chart/table switch, no duplicated finance math.                              |
| P3       | Business ledger                         | Keep consumer and business concepts separate.                                                                      | Invoices, counterparties, tax categories, mileage, receivables/payables, reviewed regional rules.                      |

## Ideas deliberately not adopted now

- **No copied AGPL/GPL implementation.** Concepts are not source code. Any
  future reuse must receive a specific license review.
- **No immediate full-ledger rewrite to double entry.** FINVERSE's provider
  ledger is already tested and useful. Splits, transfers, and reconciliation can
  be introduced as compatible evidence layers before considering a migration.
- **No unsourced cross-currency net worth.** Convenience does not justify an
  unexplained financial number.
- **No autonomous financial-advice agent.** Assistant tools may summarize and
  simulate; regulated recommendations require counsel and appropriate licensing.
- **No marketplace or bill-negotiation referral layer before the privacy and
  conflict-of-interest decision is explicit.**
- **No feature-count race.** Sure/Maybe's history is evidence that breadth is
  not the same as a sustainable product.

## Implementation rule

Each adopted idea must pass the same FINVERSE bar: pure and deterministic money
logic, provider evidence preserved, integer minor units, no currency mixing
without an explicit rate, per-user or membership isolation in both store
adapters, RLS tests, deletion/export coverage, accessible mobile behavior, and a
clear statement of what still needs external production verification.
