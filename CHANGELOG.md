# Changelog

This file records verified engineering milestones. Git history remains the
authoritative detail; `CURRENT_STATUS.md` records current gates and blockers.

## Unreleased

### Added

- Encrypted, review-first manual statement import for CSV, XLSX, text PDF, and
  supported images.
- Statement row confidence, flags, edit/split/merge/exclude/approve controls,
  audit history, summaries, duplicate checks, and per-user correction learning.
- First-use account creation from the statement picker.
- Memory-friendly project entry documents: `START_HERE.md`,
  `PROJECT_OVERVIEW.md`, `CURRENT_STATUS.md`, `ARCHITECTURE.md`,
  `DEVELOPMENT_GUIDE.md`, and `KNOWN_ISSUES.md`.

### Changed

- Flutter now uses the light theme as the only/default application theme.
- Integration branch merged current protected `main` at `a21b374` and now
  includes the verified `d0af44d` supply-chain milestone.
- Split membership changes are admin-only, split expenses can only name the
  authenticated actor as payer, and PostgreSQL forced-RLS enforces both rules.
- Backup scripts restrict local archive permissions and remove temporary dump
  files after compression.
- Public edge images are digest-pinned, and release publication now requires a
  successful blocking Container scan in addition to the exact-SHA CI run.
- Flutter CI/release builds pin the toolchain to Flutter 3.44.9.

### Verified

- Integration branch: API typecheck, 873 in-memory tests, 1,050 PostgreSQL
  tests, Flutter tests, and Flutter web release build all pass.
- Integration branch: Flutter analysis and focused statement extraction,
  encryption, summary, and API review tests.
- Production dependency audit: zero known vulnerabilities reported by npm on
  2026-08-28.

### Pending

- Complete adversarial security review and remediation.
- Replace immediate split membership with an auditable invitation requiring
  target acceptance, with decline, revocation, removal, and notification.
- Full regression suite and final integration into protected `main`.
- External production/provider/device/backup gates listed in
  `KNOWN_ISSUES.md`.
