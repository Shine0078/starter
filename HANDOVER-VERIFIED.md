# FINVERSE status — 2026-08-18 (verified)

Canonical working branch: `codex/passkey-webauthn-p0`
HEAD at write time: `1bf94ef`
Do not treat older handover prose as current. This file records only what was executed and observed in this session.

## Passkey / WebAuthn (P0)

Implemented and proven on this branch:

- Unauthenticated `POST /webauthn/login/options` and `POST /webauthn/login/verify`
- Shared hashed ceremony IDs, purpose-bound, atomically consumed
- `finverse_webauthn_credential_owner` returns only `user_id` under FORCE RLS
- Public key loaded under `withUserScope`
- Required user verification on register and login
- Successful assertion issues the normal `{ user, tokens }` session
- `/auth/me` succeeds for that user
- Enroll/remove require password (+ MFA if enabled)
- Passkey add/remove write security events and send a security notice
- Flutter `passkeyLoginVerify` now goes through `_authenticate` and persists the session

Proven locally:

- `npx vitest run test/webauthn.spec.ts` — 11 passed
- Postgres E2E `test/webauthn-postgres.spec.ts` + `test/rls.spec.ts` — 66 passed, including refresh, concurrent replay, locked account, cross-user bind
- `npx tsc --noEmit` — pass
- `npm test --workspace @finverse/api` — 834 passed, 7 skipped (in-memory)
- `auth-api.spec.ts` — 70 passed after the earlier `test:db` hook timeout, which occurred while HEAD had flipped back to `main`

A full `npm run test:db` was started more than once. One complete attempt reached 900 passed / 70 skipped, then failed because the checkout had flipped to `main` and `webauthn-postgres.spec.ts` disappeared mid-run. That is **not** a fresh full `test:db` pass on `1bf94ef`.

## Release / production invariants

- Production requires `DATABASE_APP_URL`, refuses the same role as `DATABASE_URL` when both are set, and refuses SUPERUSER, BYPASSRLS, or a runtime role that owns public tables
- Release and database-release require a 40-character SHA with a successful CI run
- `render.yaml` is named `finverse-preview` / `finverse-preview-db` and is labeled preview-only
- GitHub Actions used by CI/release are SHA-pinned; GHCR push now requests provenance + SBOM

## Mobile / offline

- Rejected 4xx replays increment `rejectedMutationCount` and are shown in the home banner
- Rejected mutation list is cleared on sign-out / session restore
- Concurrent replay is serialized
- Flutter tests: 109 passed (`flutter test`)
- `flutter analyze` — no issues
- `flutter build web --release --no-web-resources-cdn --base-href=/app/` — succeeded
- `flutter build apk --release --dart-define=API_BASE_URL=https://api.example.invalid` — succeeded (`apps/mobile/build/app/outputs/flutter-apk/app-release.apk`)

## Still open (not claimed complete)

- Full `test:db` on this exact SHA
- Image digest pinning (`node:22-bookworm-slim`, `postgres:16-alpine`, Flutter image)
- Passkey UI (API/client contract exists; no settings/login screen calls it yet)
- Native WebAuthn origin allowlist (current config requires RP ID == origin host)
- Physical-device / Safari-Chrome passkey smoke
- Preview DB name vs leftover `finverse-db` if any hosting doc still references the old name
- External owner gates: production Plaid/Stripe, domains/TLS, SMTP, APNs/FCM, Apple/Android store signing, legal/privacy review, independent pentest

## Owner actions required

1. Keep working on `codex/passkey-webauthn-p0`. `main` is still `1a4a9f4`.
2. After merge, run CI on that SHA and only then dispatch release/database-release with that SHA.
3. Provision production with a restricted `DATABASE_APP_URL` role that does not own public tables.
4. Provide production provider credentials and signing accounts before calling the system production-ready.
