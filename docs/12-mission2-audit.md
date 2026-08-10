# MISSION2 audit and delivery status

This is a code-grounded status of the MISSION2 requirements. It is deliberately
shorter than the original prompt and distinguishes working code from external
launch work.

`MISSION1.md` is not present in the repository or its Git history. The available
`MISSION.md` brief and `HANDOVER.md` were audited instead; a separate MISSION1
file would be required to verify any requirements unique to that document.

## Delivered in the repository

- Flutter design tokens, semantic colour themes, typography, skeleton/error/
  empty states, reduced-motion handling, chart semantics, and 200% text-scale
  tests.
- Authenticated dashboard, budgets, goals, manual assets/debts/credit cards,
  searchable transactions, category corrections with durable rules, session
  controls, MFA, device lock, privacy/consent, export, deletion recovery, PDF
  reports, alerts, subscriptions, and cash-flow planning.
- Plaid adapter with encrypted access tokens, password step-up for Link,
  Android native Link, browser Link for the iPhone PWA, exchange, initial sync,
  cursor-based `/transactions/sync`, mutation-safe pagination, pending/posted
  reconciliation, removed rows, reconnect, webhook verification/retry, and
  multiple-institution support.
- Internal-transfer detection prevents movements between a user's own accounts
  from inflating income or spending. Categorisation is deterministic and
  explainable; user corrections create reusable rules.
- Stable transaction keyset pagination (`before` cursor) in the Postgres and
  in-memory stores, API, client, and mobile feed. The feed loads older pages as
  the user scrolls.
- Debounced transaction search plus validated filters for money type, category,
  account, pending/posted state, recurring status, amount bounds, and inclusive
  date ranges. The same query contract is enforced by both store adapters.
- Durable transaction annotations now cover local merchant names, private notes,
  and an exclude/include analytics control. These fields are user-scoped,
  searchable, preserved across provider re-sync, included in exports, and
  honored by budgets, analytics, forecasts, subscriptions, health scoring, and
  financial alerts. The original provider description remains unchanged.
- A dedicated `AnalyticsScreen` with month metrics, category chart, financial
  health, subscriptions, evidence-backed insights, week/month/quarter/year/
  lifetime/custom period selection, spending velocity, and a financial timeline, backed by the server-side analytics
  engine and a forecast/simulator entry point.
- Explainable refund matching links settled refunds to earlier purchases using
  account, currency, merchant, amount, and timing evidence; anomaly alerts also
  catch near-duplicate merchant descriptors conservatively.
- Read-only encrypted offline cache, safe stale-data banners, bounded request
  timeouts, release-build API URL validation, serialized refresh rotation
  across concurrent 401 responses, and a best-effort bank refresh when the
  authenticated dashboard resumes after the app has been backgrounded. A
  network outage no longer signs a user out while an expired access token is
  waiting for refresh, and a temporarily locked Keychain/Keystore has an
  explicit retry state rather than looking like account loss.
- A shared authenticated-write revision signal now invalidates the live
  dashboard, transactions, budgets, goals, analytics, and bank-connection
  screens immediately after sync or another successful mutation, including
  when those screens are kept alive in the tab stack.
- The API now has a bounded 30-second, per-process analytics cache keyed by
  user, period, date range, and currency. Transaction/account/bank events
  invalidate affected users immediately; raw transactions remain the only
  source of truth and cache misses recompute the report.
- A small internal finance event bus publishes import, update, categorisation,
  account, and bank-sync events inside the NestJS monolith without adding a
  queue or a second service.
- The mock-data developer dashboard is now development-only; production serves
  the Flutter bundle or fails closed instead of exposing fabricated ledger data.
  The legacy `/api/sync` sample route is also refused for every persistent
  Postgres deployment, not only for `NODE_ENV=production`.

## Evidence

- API in-memory suite: 378 passing, 5 database-only skips.
- PostgreSQL contract/RLS suite: 479 passing in embedded PostgreSQL.
- Flutter: 54 widget/design tests passing, `flutter analyze` clean.
- Android debug APK and web release build both compile. The Android emulator
  booted but its package/activity services were unavailable during an install
  attempt; that is an emulator image issue, not a compile failure.
- Windows Flutter cannot compile iOS; Xcode/macOS remains required. Native iOS
  Plaid Link still needs its Swift SDK bridge; the iPhone PWA uses Plaid Link
  for Web today.
- The live Plaid Sandbox path was verified on 2026-08-10: web Link-token
  creation, public-token exchange, five-account import, and idempotent
  incremental sync all completed against the Postgres API. The Android path
  now fails closed with `PLAID_CONFIGURATION` until the package identifier is
  allowlisted in Plaid. Provider failures no longer expose SDK request details
  or credentials in logs.
- Persisted mobile sessions now reject expired refresh tokens and refresh an
  expired access token before showing the dashboard, with widget coverage for
  both paths.
- The transaction annotation migration and API/mobile workflow are covered by
  the authenticated API isolation test, the Postgres store contract, and the
  analytics exclusion test.

## Still incomplete locally

- OS-level background mobile sync, push delivery, receipts/OCR, localisation,
  passkeys/WebAuthn, and native iOS Plaid Link.
- Remaining screens still have inline styling and `setState`; the design system
  foundation is complete but adoption is partial.

## External launch gates

The Plaid dashboard available to this workspace is Sandbox-only. Production bank
access, a public HTTPS deployment/domain, managed Postgres/backups/monitoring,
SMTP/push credentials, Stripe and mobile-store accounts, Apple signing, legal
documents/regulatory review, and an independent penetration test require owner
accounts or approvals. The code has configuration hooks and refuses unsafe
production defaults; it must not be marketed as accepting real users until
those gates are completed.
