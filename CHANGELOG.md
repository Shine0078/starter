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
- Integration branch merged current protected `main` at `a21b374`.
- Split membership changes are admin-only, split expenses can only name the
  authenticated actor as payer, and PostgreSQL forced-RLS enforces both rules.
- Backup scripts restrict local archive permissions and remove temporary dump
  files after compression.

### Verified

- Current `main`: API typecheck, 855 in-memory tests, and 1,021 PostgreSQL tests.
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
