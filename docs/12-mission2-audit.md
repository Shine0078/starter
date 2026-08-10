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
  Android native Link, native iOS LinkKit bridge, browser Link for the iPhone
  PWA, exchange, initial sync,
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
- Recurring detection now runs after every complete Plaid incremental sync (not
  only the legacy demo sync), across the full stored history. Transaction detail
  also supports a durable user override; an explicit choice survives later bank
  pages, webhook retries, and re-syncs while automatic flags continue to be
  recomputed for untouched rows.
- A non-destructive possible-duplicate marker is now user-controlled and
  durable. It is isolated per user, survives re-sync, is visible in transaction
  detail, and is included in CSV export without deleting or mutating provider
  evidence.
- Transaction detail exposes a dedicated transfer action that records a
  one-off user correction without creating a broad merchant rule, so internal
  movements can be fixed safely from the feed.
- A dedicated `AnalyticsScreen` with month metrics, category chart, financial
  health, subscriptions, evidence-backed insights, week/month/quarter/year/
  lifetime/custom period selection, spending velocity, and a financial timeline, backed by the server-side analytics
  engine and a forecast/simulator entry point.
- Explainable refund matching links settled refunds to earlier purchases using
  account, currency, merchant, amount, and timing evidence; anomaly alerts also
  catch near-duplicate merchant descriptors conservatively.
- Encrypted offline cache plus an encrypted, user-scoped mutation queue for
  idempotent transaction preference edits. Queued edits collapse to the latest
  value, keep the optimistic UI state, show a pending-sync banner, and replay
  automatically on session restore or dashboard resume. Safe stale-data
  banners, bounded request timeouts, release-build API URL validation,
  serialized refresh rotation across concurrent 401 responses, and a
  best-effort bank refresh are also covered. A network outage no longer signs
  a user out while an expired access token is waiting for refresh, and a
  temporarily locked Keychain/Keystore has an explicit retry state rather than
  looking like account loss.
- A shared authenticated-write revision signal now invalidates the live
  dashboard, transactions, budgets, goals, analytics, and bank-connection
  screens immediately after sync or another successful mutation, including
  when those screens are kept alive in the tab stack.
- The API now has a bounded 30-second, per-process analytics cache keyed by
  user, period, date range, and currency. Transaction/account/bank events
  invalidate affected users immediately; raw transactions remain the only
  source of truth and cache misses recompute the report.
- A deterministic server-side data-quality report now checks account coverage,
  malformed dates and currencies, duplicate provider evidence, stale bank
  links, and provider connections needing re-authentication. It is exposed at
  authenticated `GET /api/data-quality` and the dashboard shows a plain-language
  warning card instead of presenting questionable analytics without context.
- Native local-alert delivery is now wired through a platform-safe Flutter
  service. Users can grant Android/iPhone notification permission from the
  notification preferences screen; unread server alerts are presented once per
  app session without requiring remote push credentials. Browser/desktop builds
  fail closed, and remote push/background refresh remain external/native work.
- A small internal finance event bus publishes import, update, categorisation,
  account, and bank-sync events inside the NestJS monolith without adding a
  queue or a second service.
- The mock-data developer dashboard is now development-only; production serves
  the Flutter bundle or fails closed instead of exposing fabricated ledger data.
  The legacy `/api/sync` sample route is also refused for every persistent
  Postgres deployment, not only for `NODE_ENV=production`.

## Evidence

- API in-memory suite: 384 passing, 5 database-only skips.
- PostgreSQL contract/RLS suite: 485 passing in embedded PostgreSQL.
- Flutter: 59 widget/design tests passing, `flutter analyze` clean.
- Android debug APK and web release build both compile. The Android emulator
  booted but its package/activity services were unavailable during an install
  attempt; that is an emulator image issue, not a compile failure.
- Windows Flutter cannot compile iOS; Xcode/macOS remains required for the
  LinkKit package resolution, Universal Link OAuth return, and device test.
  The iPhone PWA remains available as a browser fallback.
- The live Plaid Sandbox credentials were configured locally (never committed)
  and the provider path was verified on 2026-08-10 against the Postgres API:
  a disposable Sandbox public token exchanged into 2 accounts and 125
  transactions, a second incremental sync returned 0 changes, and the link and
  test user were removed. Authenticated web Link-token creation also succeeded.
  The Android path fails closed with an actionable
  `PLAID_CONFIGURATION` response until the owner saves `com.finverse.finance`
  in Plaid's Allowed Android package names; Plaid requires Google identity
  verification before that dashboard change can be saved. No production key or
  real-customer bank data is claimed. Provider failures no longer expose SDK
  request details or credentials in logs.
- Persisted mobile sessions now reject expired refresh tokens and refresh an
  expired access token before showing the dashboard, with widget coverage for
  both paths.
- The transaction annotation and recurring-override migrations plus their
  API/mobile workflows are covered by the authenticated API isolation test, the
  Postgres store contract, the analytics exclusion test, and a provider-sync
  recurrence integration test.
- The mobile offline mutation queue has widget coverage for encrypted
  user-scoped storage, latest-value collapse, optimistic retry semantics, and
  successful replay.
- Data-quality domain checks and authenticated route protection are covered by
  focused API tests; Flutter analyzer and the 59-test mobile suite remain clean.
- A provider-neutral public deployment path now runs the tagged API and optional
  Flutter web bundle behind Caddy with automatic HTTPS. Port 3000 remains
  private to the Docker network, and native phones or the `/app/` PWA can use
  that public origin instead of Tailscale.

## Still incomplete locally

- OS-level background mobile sync, push delivery, receipts/OCR, localisation,
  and passkeys/WebAuthn. Native iOS LinkKit is wired in source and the Xcode
  project, but still needs a Mac/Xcode build, a registered Universal Link, and
  an iPhone OAuth smoke test.
- Remaining screens still have inline styling and `setState`; the design system
  foundation is complete but adoption is partial.

## External launch gates

The Plaid dashboard available to this workspace is Sandbox-only. Production bank
access, choosing and operating a public HTTPS deployment/domain, managed Postgres/backups/monitoring,
SMTP/push credentials, Stripe and mobile-store accounts, Apple signing, legal
documents/regulatory review, and an independent penetration test require owner
accounts or approvals. The code has configuration hooks and refuses unsafe
production defaults; it must not be marketed as accepting real users until
those gates are completed.
