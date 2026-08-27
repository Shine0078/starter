# FINVERSE status

Canonical current-state file. Older handovers are historical unless they match this file and the repository.

Verified: 2026-08-27

## Current branch

Working branch: `codex/passkey-webauthn-p0`
Protected default branch: `main`

## Current commit SHA

- `main` / `origin/main`: `a21b374` (merge of [PR #16](https://github.com/Shine0078/starter/pull/16))
- Working branch `codex/passkey-webauthn-p0` feature tip is `7a7fb8f` (this
  status update is a documentation-only follow-up)

## Canonical deployment

Google Cloud Run + Neon, same-origin PWA:

- Web: https://finverse-d6vqs5iu7q-uc.a.run.app/app/
- Readiness: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness
- Identity: https://finverse-d6vqs5iu7q-uc.a.run.app/api/version
- GitHub `API_BASE_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app
- GitHub `PRODUCTION_HEALTH_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness

GitHub Pages and `finverse.onrender.com` are not the current API.

## Current API / DB / WebAuthn

- Live readiness: HTTP 200, `service=finverse-api`, Postgres reachable
- Live `/api/version`: HTTP 404 (old image, no identity yet)
- Live legal: placeholder `example.com` URLs, `registrationRequired=true`
- Live WebAuthn: `{"available":false}`

## Test results

- Main CI on `eebfd1d`: success
- PR #16 CI on `db0e879`: success (API, Flutter analyze/tests/Android/PWA, unsigned iOS, CodeQL, Trivy runtime image)

- Main CI on merge commit `a21b374`: success

Local verification on `b1974dd` (2026-08-27): API typecheck/build passed;
manual-import focused tests passed (11 tests); full PostgreSQL suite passed
(71 files, 1,045 tests); `npm audit --omit=dev` reported zero vulnerabilities;
Flutter analyze passed; Flutter tests passed (118); Flutter web and debug APK
builds passed. Migration application validated all 32 migrations and provisioned
the restricted runtime role.

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
  bounded, signature-checked, encrypted at rest, and staged for review.
- Rows expose date, description, merchant, amount, currency, debit/credit,
  category, confidence, recurring/duplicate/refund/transfer/unusual flags, and
  extraction-error warnings. Users can edit, split, merge, include, exclude,
  recategorize, approve, delete the source, and inspect an audit trail.
- Approval atomically writes normal ledger transactions and import batches;
  statement identity plus transaction provider fingerprints prevent duplicates.
- PostgreSQL migrations 031-032 apply cleanly under the restricted runtime role
  with forced RLS. API DB tests cover cross-user isolation, source retention,
  approval, and duplicate protection. No remote model-training path is used;
  user corrections feed only the same user's local classifier/rules.
- Current extraction is synchronous and deliberately bounded. Scanned PDFs
  without a text layer return a warning rather than guessed transactions; a
  durable OCR worker is required before increasing limits for large-volume use.

## P0 remaining

- Redeploy Cloud Run from a CI-green SHA with `GIT_SHA`
- Replace live legal URLs before real users
- Configure live `WEBAUTHN_*`
- Physical passkey proof
- Confirm Neon runtime role is restricted

## P1 remaining

- Production Plaid/Stripe/SMTP/push
- Physical-device matrix
- Production crash provider
- Accessibility hardware audit

## P2 remaining

- Pentest, legal review, DR, incident tabletop, store review, secret lifecycle

## Exact next action

Set live `LEGAL_*` to the same-origin technical-beta documents (`/api/legal/terms/technical-beta-v1` and `/api/legal/privacy/technical-beta-v1`), then deploy a CI-green SHA to Cloud Run with `GIT_SHA` set. Replace those documents with counsel-reviewed Terms/Privacy before a commercial launch.
