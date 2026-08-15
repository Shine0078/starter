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
