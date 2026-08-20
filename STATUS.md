# FINVERSE status

Canonical current-state file. Older handovers are historical unless they match this file and the repository.

Verified: 2026-08-20

## Current branch

Working branch: `codex/passkey-webauthn-p0`
Protected default branch: `main`

## Current commit SHA

- `main` / `origin/main`: `eebfd1d` (merge of PR #1)
- Local follow-up commits on the working branch are not released until their own CI is green.

Open PR: https://github.com/Shine0078/starter/pull/16

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

- Main CI on `eebfd1d`: success (API, Flutter analyze/tests, Android, PWA, unsigned iOS)
- Local: config + schema-identity + auth-api 71 passed; Flutter conflict/offline tests 3 passed; analyze clean on changed Dart files

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

Replace live `LEGAL_*` values with reviewed HTTPS documents, then deploy a CI-green SHA to Cloud Run with `GIT_SHA` set.
