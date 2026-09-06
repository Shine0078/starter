# FINVERSE status

Canonical current-state file. Older handovers are historical unless they match this file and the repository.

Verified: 2026-09-06

## Current branch

Working branch: `main`
Protected default branch: `main`

## Current commit SHA

- Local `main`: `2c9bf81` (`fix(imports): link PostgreSQL approval batches to statements`).
- FINVERSE source, tests, migrations, mobile code, deployment controls, and
  documentation are committed. Three unrelated local artifact directories remain
  untracked and are intentionally excluded from release commits.

## Canonical deployment

Google Cloud Run + Neon, same-origin PWA:

- Web: https://finverse-d6vqs5iu7q-uc.a.run.app/app/
- Readiness: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness
- Identity: https://finverse-d6vqs5iu7q-uc.a.run.app/api/version
- GitHub `API_BASE_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app
- GitHub `PRODUCTION_HEALTH_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness

GitHub Pages and `finverse.onrender.com` are not the current API.

## Current API / DB / WebAuthn

- Live `/api/version`: HTTP 404, proving the public URL is still an older image.
- Live `/app/`: HTTP 200, but it is the older dark bundle and has no matching
  `/api/version` candidate identity. It must not be treated as the verified app.
- Local preview: `http://localhost:3001/app/` serves the light bundle and the
  statement-import review flow; it is an isolated in-memory runtime and is not
  the hosted deployment.
- Live legal, Plaid, WebAuthn, SMTP, and Neon runtime-role settings remain
  external deployment configuration and are not inferred from local tests.

## Test results

- Main CI on `5ebff34`: success (`34013154838`)
- Container scan on `5ebff34`: success (`34013154867`)
- CodeQL on `5ebff34`: success (`34013154901`)
- Release artifacts on `5ebff34`: success (`34013496867`); API image build,
  SBOM/provenance, GHCR publication, keyless Cosign signing, Android release,
  and installable web/PWA artifacts all completed.

Local verification on `main` (2026-09-06): API typecheck and production build
passed; API in-memory suite passed (67 files, 891 tests, 9 skipped); fresh
PostgreSQL suite passed (73 files, 1,076 tests) under the restricted runtime
role with forced RLS; the statement-import PostgreSQL E2E passed, including
queued processing, approval, batch provenance, analytics updates, and `/auth/me`;
Flutter analysis passed; all Flutter tests passed (119); Flutter web release
build passed. Focused statement analysis/import/categorization/encryption tests
passed (50/50). The candidate includes migrations 041-043 for ledger-to-source
provenance, safe document metadata, and authenticated encryption of staged
statement text.

## Completed this session

- Restored `Final Goal.md`
- Refuse placeholder example.com legal URLs
- Expand Cloud Run deploy smoke and `/api/version` schema identity
- Require iOS passkey user verification
- Add SHA-pinned Trivy HIGH/CRITICAL image scan
- Offline conflict-center UI
- Privacy-preserving local crash log

Later this session:

- Optional HTTPS `SENTRY_DSN`
- Trivy now scans `Dockerfile.public`
- Flutter CI reports outdated packages
- Daily spending heatmap on analytics

CI follow-up:

- Dropped unsupported iOS `residentKeyPreference`
- Pinned Trivy scanner to v0.74.0
- Production readiness fails closed if the runtime DB role is unrestricted
- Optional Sentry DSN now sends redacted crash reports
- Category spending drills into matching transactions

CI follow-up 2:

- Trivy fail-closed scan uses the production API runtime image
- Public Cloud Run image scan is reported without failing CI on Flutter toolchain CVEs
- Dashboard cards can be hidden locally without deleting data

- Leave-one-out evaluation for the user-correction categorizer

## Manual statement import (verified 2026-08-27)

- CSV, XLSX, text-PDF, and PNG/JPEG/WEBP/TIFF/BMP uploads are authenticated,
  bounded, signature-checked, encrypted at rest, and staged for review. OCR is
  bounded and preserves uncertain rows for review rather than guessing.
- Rows expose date, description, merchant, amount, currency, debit/credit,
  category, confidence, recurring/duplicate/refund/transfer/unusual flags, and
  extraction-error warnings. Users can edit, split, merge, include, exclude,
  recategorize, approve, delete the source, and inspect an audit trail.
- Approval atomically writes normal ledger transactions and import batches;
  statement identity plus transaction provider fingerprints prevent duplicates.
- PostgreSQL migrations 031-043 apply cleanly under the restricted runtime role
  with forced RLS. API DB tests cover cross-user isolation, source retention,
  approval, batch provenance, and duplicate protection. No remote model-training
  path is used;
  user corrections feed only the same user's local classifier/rules.
- Current extraction is durable and deliberately bounded. Scanned PDFs without
  a text layer return a warning rather than guessed transactions; production
  OCR/load evidence and external worker observability remain required before
  increasing limits for large-volume use. Source retention is time-bounded and
  user deletion preserves approved records and audit history.

## P0 remaining

- Deploy the exact verified `main` SHA `2c9bf81` to Cloud Run with `GIT_SHA`,
  then verify `/api/readiness`, `/api/version`, and `/app/` from the same origin
- Supply reviewed production legal URLs and live `WEBAUTHN_*` configuration
- Complete physical-device passkey proof and real Neon runtime-role attestation
- Configure approved Plaid Production credentials and webhook/redirect settings
- Run a production OCR/load observation before raising upload limits

## P1 remaining

- Production Plaid/Stripe/SMTP/push
- Physical-device matrix
- Production crash provider
- Accessibility hardware audit

## P2 remaining

- Pentest, legal review, DR, incident tabletop, store review, secret lifecycle

## Exact next action

Set live `LEGAL_*` to the same-origin technical-beta documents
(`/api/legal/terms/technical-beta-v1` and
`/api/legal/privacy/technical-beta-v1`), then deploy `2c9bf81` to Cloud Run
with `GIT_SHA` set. Verify `/api/readiness`, `/api/version`, and `/app/` from
the same origin. Replace those documents with counsel-reviewed Terms/Privacy
before a commercial launch.
