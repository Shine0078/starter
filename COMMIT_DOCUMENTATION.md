# Commit Documentation — starter

Branch: `main`
Generated after a granular, one-file-per-commit review of all uncommitted changes.
Each entry lists commit order, hash, affected file, message, purpose, and a short
explanation of the change.

| # | Commit | File | Message | Purpose | Explanation |
|---|--------|------|---------|---------|-------------|
| 1 | `c44f408` | `apps/mobile/lib/design/colors.dart` | feat(mobile): add hero gradient palette and refresh brand colors | Brand palette | Add `heroGradientStart/End`, `onHero`, `onHeroMuted`, `heroDebt` to `FinColors` and refresh the emerald-teal palette. |
| 2 | `78a6858` | `apps/mobile/lib/design/theme.dart` | feat(mobile): shift brand seed to emerald-teal | Brand seed | Change the brand seed from institutional blue to emerald-teal. |
| 3 | `c229f02` | `apps/mobile/lib/screens/dashboard_screen.dart` | feat(mobile): make dashboard responsive with two-column wide layout | Responsive layout | Split the dashboard into a two-column layout at >=900px and extract sections into helper methods. |
| 4 | `36da7fc` | `apps/mobile/lib/widgets/budget_tile.dart` | feat(mobile): add monogram avatar and row layout to budget tiles | Budget tile | Add a monogram avatar and restructure the tile into a row layout. |
| 5 | `05b9a17` | `apps/mobile/lib/widgets/health_score_card.dart` | feat(mobile): render health score as circular gauge | Health score card | Replace the numeric wrap with a circular score gauge painter and restructure. |
| 6 | `e3dfbc4` | `apps/mobile/lib/widgets/net_position_card.dart` | feat(mobile): present net position as brand-gradient hero | Net position hero | Present the net position on the brand gradient as the app's hero surface. |
| 7 | `b6d9742` | `apps/mobile/lib/widgets/spending_chart.dart` | feat(mobile): render spending as donut chart with legend | Spending chart | Replace linear bars with a donut chart and a per-category legend. |
| 8 | `f3195a2` | `apps/mobile/lib/widgets/transaction_tile.dart` | feat(mobile): add monogram avatar to transaction rows | Transaction tile | Add a monogram avatar and use `fin.income` for inflow color. |

## Note on line-ending-only files

`git status` reported 41 additional files as modified (`HANDOVER.md`, `MISSION1.md`,
`MISSION2.md`, the Android/iOS platform config, `run-ios-lan.ps1`, and the infra
scripts). These files have **no content change** — they differ only in line endings
(CRLF in the working tree vs the LF-normalized index enforced by `.gitattributes`
`* text=auto eol=lf`). Their `git diff` is empty. They were normalized via
`git add` (which stages nothing, since the normalized content equals HEAD) rather
than committed, so no noise commits were fabricated.

## Second review — 2026-08-15 feature work

Net-worth history, property accounts, natural-language search, and database
release/monitoring hardening. One file per commit, in dependency order.

| # | Commit | File | Message | Purpose |
|---|--------|------|---------|---------|
| 1 | `262d2ce` | `apps/api/migrations/020_net_worth_snapshots.sql` | feat(api): add net-worth snapshots migration with RLS | Snapshot table with row-level security |
| 2 | `b311346` | `apps/api/src/domain/types.ts` | feat(api): add property account type and net-worth snapshot types | Domain types |
| 3 | `a583216` | `apps/api/src/domain/transactions/natural-search.ts` | feat(api): add deterministic natural-language transaction search | Search interpreter |
| 4 | `9f4fb1a` | `apps/api/src/infra/in-memory-store.ts` | feat(api): record and list net-worth history in memory store | In-memory store |
| 5 | `bf04196` | `apps/api/src/infra/postgres/stores.ts` | feat(api): record and list net-worth history in postgres store | Postgres store |
| 6 | `9c98dc0` | `apps/api/src/infra/postgres/migrate.ts` | feat(api): add migration inspection and advisory lock | Migration safety |
| 7 | `67cc595` | `apps/api/src/ports/index.ts` | feat(api): extend account store port with net-worth history | Store port |
| 8 | `72960f3` | `apps/api/src/modules/banking/banking.service.ts` | feat(api): record net-worth snapshot on bank sync | Snapshot on sync |
| 9 | `6cb5618` | `apps/api/src/modules/ledger/ledger.service.ts` | feat(api): record net-worth snapshots and interpret search | Ledger service |
| 10 | `a0b1127` | `apps/api/src/modules/ledger/ledger.controller.ts` | feat(api): expose net-worth history and natural search | Ledger endpoints |
| 11 | `f115a4c` | `apps/api/src/modules/privacy/privacy.service.ts` | feat(api): include net-worth history in account export | Data export |
| 12 | `a986546` | `packages/contracts/src/index.ts` | feat(contracts): add property type and net-worth snapshot DTO | Shared contracts |
| 13 | `9d50cd0` | `apps/mobile/lib/models/models.dart` | feat(mobile): add net-worth snapshot model | Mobile model |
| 14 | `fc29c9c` | `apps/mobile/lib/api/client.dart` | feat(mobile): fetch net-worth history and search interpretation | API client |
| 15 | `f288cee` | `apps/mobile/lib/widgets/net_worth_history_chart.dart` | feat(mobile): add accessible net-worth history chart | History chart |
| 16 | `dda0be5` | `apps/mobile/lib/screens/dashboard_screen.dart` | feat(mobile): show net-worth history chart on dashboard | Dashboard |
| 17 | `f7be917` | `apps/mobile/lib/screens/bank_connections_screen.dart` | feat(mobile): support property account type | Property UI |
| 18 | `af35662` | `apps/mobile/lib/screens/transactions_screen.dart` | feat(mobile): show natural search interpretation | Search UI |
| 19 | `62953aa` | `apps/mobile/lib/l10n/app_en.arb` | feat(mobile): localize net-worth and property strings (en) | English strings |
| 20 | `4805e60` | `apps/mobile/lib/l10n/app_fr.arb` | feat(mobile): localize net-worth and property strings (fr) | French strings |
| 21 | `cf79c04` | `apps/mobile/lib/l10n/app_localizations.dart` | feat(mobile): regenerate localization interface | Generated interface |
| 22 | `6be242d` | `apps/mobile/lib/l10n/app_localizations_en.dart` | feat(mobile): regenerate English localizations | Generated en |
| 23 | `9d747b9` | `apps/mobile/lib/l10n/app_localizations_fr.dart` | feat(mobile): regenerate French localizations | Generated fr |
| 24 | `5bc466b` | `apps/api/test/natural-search.spec.ts` | test(api): cover natural-language search interpretation | Search tests |
| 25 | `ee21974` | `apps/api/test/store-contract.ts` | test(api): cover net-worth history store contract | Store contract tests |
| 26 | `11db31e` | `apps/api/test/rls.spec.ts` | test(api): cover net-worth snapshot row-level security | RLS tests |
| 27 | `2c4cc61` | `apps/api/test/account-deletion-db.spec.ts` | test(api): cover net-worth snapshot deletion | Deletion tests |
| 28 | `9cd1b99` | `apps/api/test/auth-api.spec.ts` | test(api): cover net-worth export, property, and natural search | API tests |
| 29 | `0a85376` | `apps/mobile/test/net_worth_history_chart_test.dart` | test(mobile): cover net-worth history chart rendering | Chart widget test |
| 30 | `2738749` | `apps/mobile/test/widget_test.dart` | test(mobile): cover property type and search hint | Widget tests |
| 31 | `3d8244f` | `apps/api/scripts/migration-status.ts` | feat(api): add migration status and verify script | Migration CLI |
| 32 | `2ec9d9b` | `apps/api/package.json` | feat(api): add migration status and verify scripts | Package scripts |
| 33 | `d6cbf9e` | `.github/workflows/database-release.yml` | ci: add guarded database release workflow | Release workflow |
| 34 | `8b687c7` | `.github/workflows/uptime.yml` | ci: add production uptime incident workflow | Uptime workflow |
| 35 | `191d85d` | `.github/workflows/ci.yml` | ci: add backup and restore drill to CI | Backup drill |
| 36 | `1bea881` | `docs/15-incident-response.md` | docs: add incident response runbook | Incident runbook |
| 37 | `490ef8e` | `docs/09-launch-operations.md` | docs: document database release and uptime operations | Ops docs |
| 38 | `bbc3a69` | `docs/08-what-blocks-selling.md` | docs: update launch blockers with backup and incident status | Blocker docs |
| 39 | `d01a904` | `Not Complete list .md` | docs: add launch readiness checklist and implementation log | Readiness checklist |
