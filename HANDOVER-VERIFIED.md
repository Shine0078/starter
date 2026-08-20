# FINVERSE status - 2026-08-20 (verified)

Canonical working branch: `codex/passkey-webauthn-p0`
HEAD at write time: `main` is `eebfd1d` (merge of PR #1). Canonical current-state file is `STATUS.md`.
Do not treat older handover prose as current. This file is a dated evidence log; `STATUS.md` is the source of truth.

## Canonical deployment

Google Cloud Run + Neon, same-origin PWA:

- Web: https://finverse-d6vqs5iu7q-uc.a.run.app/app/
- Readiness: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness (200, service=finverse-api, store=postgres, database=reachable)
- Legal: https://finverse-d6vqs5iu7q-uc.a.run.app/api/legal (registrationRequired=true, placeholder example.com URLs)
- WebAuthn: https://finverse-d6vqs5iu7q-uc.a.run.app/api/webauthn/status (`available:false` until RP env is set)
- GitHub `API_BASE_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app
- GitHub `PRODUCTION_HEALTH_URL`: https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness
- `finverse.onrender.com/healthz` is still the unrelated Express placeholder (`Cannot GET /healthz`)
- GitHub Pages is not the canonical API

## Current API / DB health

Live Cloud Run readiness returned service `finverse-api`, store `postgres`, database `reachable` on 2026-08-20.

## Tests this session

- `npx vitest run test/config.spec.ts test/auth-api.spec.ts` — 102 passed
- `dart analyze` on passkey ceremony files — no issues
- `flutter test test/widget_test.dart --name "unsupported passkey|completes passkey login"` — 2 passed
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities

## Completed this session

- Production requires `GIT_SHA`; `/api/version` and readiness advertise `service=finverse-api`
- Docker/Cloud Build/CI/release pass `GIT_SHA`
- Cloud Run deploy writes GIT_SHA and probes `/api/readiness` plus `/api/version`
- Uptime fails closed when `PRODUCTION_HEALTH_URL` is missing and requires a FINVERSE identity body
- `main` branch protection: PR required, required CI, up-to-date, no force push, no deletion, conversation resolution
- CODEOWNERS for auth, WebAuthn, migrations, postgres, infra, workflows
- Native Android Credential Manager and iOS AuthenticationServices passkey ceremonies (API still verifies)
- README names Cloud Run as the only public technical-beta; Render is preview-only
- Release workflow refuses Render as `API_BASE_URL`
- SHA-pinned CodeQL (`javascript-typescript`, security-extended)
- GitHub secret scanning, push protection, and Dependabot security updates enabled

## P0 remaining

- Main CI on `eebfd1d` succeeded
- Redeploy Cloud Run so `/api/version` exists and GIT_SHA is present
- Replace placeholder legal URLs before real users
- Set live `WEBAUTHN_*` RP/domain values
- Physical Android/iPhone passkey proof
- Confirm production runtime DB role is not owner/SUPERUSER/BYPASSRLS on Neon

## P1 remaining

- Production Plaid/Stripe/SMTP/APNs-FCM
- Physical-device acceptance matrix
- Production crash/error provider (local redacted log exists)
- Stronger SAST beyond CodeQL/Trivy
- Accessibility hardware audit

## P2 remaining

- External pentest, legal/privacy review, DR exercise, incident tabletop, store review, secret/KMS lifecycle

## External owner/provider blockers

1. Cloud Run redeploy from `eebfd1d` with GIT_SHA so /api/version exists
2. Replace example.com legal URLs before real users
3. Domain/TLS and WebAuthn RP configuration
4. Physical device passkey smoke
5. Provider production credentials and store signing

## Exact next action

PR #1 is merged and main CI on `eebfd1d` is green. Replace live LEGAL_* URLs, then redeploy Cloud Run from a CI-green SHA with GIT_SHA set. See STATUS.md.
