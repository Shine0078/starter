# Changelog

This file records verified engineering milestones. Git history remains the
authoritative detail; `CURRENT_STATUS.md` records current gates and blockers.

## Unreleased

### Added

- Encrypted, review-first manual statement import for CSV, XLSX, text PDF, and
  supported images.
- Durable production statement analysis queue with forced-RLS claims, stale-lease
  recovery, failure audit events, and mobile polling.
- Statement row confidence, flags, edit/split/merge/exclude/approve controls,
  audit history, summaries, duplicate checks, and per-user correction learning.
- First-use account creation from the statement picker.
- Split-group invitations with explicit invitee consent, decline/revocation,
  balance-safe leave/remove, and audit-preserving departure states.
- Memory-friendly project entry documents: `START_HERE.md`,
  `PROJECT_OVERVIEW.md`, `CURRENT_STATUS.md`, `ARCHITECTURE.md`,
  `DEVELOPMENT_GUIDE.md`, and `KNOWN_ISSUES.md`.

### Changed

- Flutter now uses the light theme as the only/default application theme.
- Obsolete dark-mode settings translations were removed; no dark-theme control
  remains in the mobile application.
- Integration branch merged current protected `main` at `a21b374` and now
  includes the verified `d0af44d` supply-chain milestone.
- Split membership changes are admin-only, split expenses can only name the
  authenticated actor as payer, and PostgreSQL forced-RLS enforces both rules.
- Split membership is consent-only; command-specific forced-RLS policies prevent
  direct cross-member deletion, protect the creator membership, and serialize
  balance-checked leave/remove with financial writes.
- Split settlement arithmetic now applies payments in the correct direction and
  cannot attribute a payment to a different actor.
- Backup scripts restrict local archive permissions and remove temporary dump
  files after compression; they now require age encryption before an archive is
  durable, and restore drills decrypt only into temporary files.
- Public edge images are digest-pinned, and release publication now requires a
  successful blocking Container scan in addition to the exact-SHA CI run.
- API release images now publish SBOM/provenance attestations and receive a
  keyless Cosign signature for the exact pushed digest.
- Flutter CI/release builds pin the toolchain to Flutter 3.44.9.

### Verified

- Integration branch: API typecheck/build, 878 in-memory tests, 1,062
  PostgreSQL tests, 118 Flutter tests, Flutter web release build, Android
  release APK build, and fresh-schema verification all pass.
- Integration branch: Flutter analysis and focused statement extraction,
  encryption, summary, and API review tests.
- Production dependency audit: zero known vulnerabilities reported by npm on
  2026-08-28.
- Sealed adversarial security audit: five validated protected-main findings (two
  high, three medium) with Markdown and SARIF reports generated.

### Pending

- Remediate the remaining protected-main security findings and rerun the audit
  on the final candidate.
- Add invitation push/email notifications and independently verify delivery.
- Rerun the sealed security review on the final candidate and complete
  integration into protected `main`.
- External production/provider/device/backup gates listed in
  `KNOWN_ISSUES.md`.
