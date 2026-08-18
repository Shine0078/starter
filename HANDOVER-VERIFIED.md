# FINVERSE status - 2026-08-18 (verified)

Canonical working branch: `codex/passkey-webauthn-p0`
HEAD at write time: `95a67ca`
Do not treat older handover prose as current. This file records only what was executed and observed.

## Passkey / WebAuthn (P0)

Implemented and proven on this branch:

- Unauthenticated `POST /webauthn/login/options` and `POST /webauthn/login/verify`
- Shared hashed ceremony IDs, purpose-bound, atomically consumed
- `finverse_webauthn_credential_owner` returns only `user_id` under FORCE RLS
- Public key loaded under `withUserScope`
- Required user verification on register and login
- Successful assertion issues the normal `{ user, tokens }` session
- `/auth/me` succeeds for that user
- Enroll/remove require password (+ MFA if enabled); passkey login does not satisfy management step-up
- Passkey add/remove write security events and send a security notice
- Flutter `passkeyLoginVerify` goes through `_authenticate` and persists the session
- `WEBAUTHN_ORIGIN` is now a comma-separated exact-origin allowlist under one RP ID (HTTPS hosts must equal the RP ID or be a subdomain; `android:apk-key-hash` is accepted)
- Login and settings now call the passkey client. Web uses `navigator.credentials`. Native builds report unsupported instead of inventing a hardware ceremony.

Proven locally in this session:

- `npx vitest run test/config.spec.ts test/webauthn.spec.ts` - 41 passed (includes the origin allowlist)
- Isolated `npx vitest run test/auth-api.spec.ts` - 70 passed
- `npx vitest run test/webauthn.spec.ts` after step-up negatives — 16 passed (wrong password and MFA-required enroll)
- Targeted Postgres `webauthn-postgres.spec.ts` + `rls.spec.ts` after migration 030 — 71 passed

- Flutter passkey + rejected-offline tests - 4 passed
- Targeted Dart analyze of the new ceremony/UI files - no issues

Earlier on this branch, still valid unless contradicted above:

- `npx tsc --noEmit` - pass
- `npm test --workspace @finverse/api` - 834 passed, 7 skipped (in-memory)
- Postgres E2E `test/webauthn-postgres.spec.ts` + `test/rls.spec.ts` - 66 passed at an earlier SHA; later RLS-only 63 after the owner-table assert
- `flutter test` - 109 passed before the new UI tests
- `flutter analyze` - no issues
- `flutter build web --release --no-web-resources-cdn --base-href=/app/` - succeeded
- `flutter build apk --release --dart-define=API_BASE_URL=https://api.example.invalid` - succeeded

A first full `npm run test:db` on this branch reached 926 passed / 70 skipped, then failed because `auth-api.spec.ts` `beforeAll` hit the 30s hook timeout. After raising `hookTimeout` to 60s, a second full `npm run test:db` on `4feb081` passed: **60 files, 1001 tests, 0 failed**.

## Release / production invariants

- Production requires `DATABASE_APP_URL`, refuses the same role as `DATABASE_URL` when both are set, and refuses SUPERUSER, BYPASSRLS, or a runtime role that owns public tables
- Automatic release remains main/master + 40-character SHA + successful CI
- Manual release and database-release now also require that successful CI run to be on main/master in this repository
- `render.yaml` is `finverse-preview` / `finverse-preview-db` and is labeled preview-only
- GitHub Actions used by CI/release are SHA-pinned; GHCR push requests provenance + SBOM
- Image tags are digest-pinned from live registries: node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436, ghcr.io/cirruslabs/flutter:stable@sha256:46691e311715845de03a3ba4753a475476936805b29431b1f00f1816981033f8, postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685

## Mobile / offline

- Rejected 4xx replays increment `rejectedMutationCount` and are shown with dedicated rejected copy, not the pending-sync string
- Home banner can dismiss rejected mutations
- Rejected mutation list is cleared on sign-out / session restore
- Concurrent replay is serialized
- Login has Use a passkey; settings can list/add/remove passkeys after password (+ MFA) step-up

- Registration now requires the AT flag and `body.id` to match the attested credential id
- Passkey enroll/remove routes are throttled at 10/min
- Migration 030 drops unused `webauthn_challenges.failed_attempts` and grants EXECUTE on `finverse_webauthn_credential_owner` when `finverse_app` exists
- Passkey enroll now consumes MFA only on options; verify re-checks the password against the issued ceremony
- Export, account deletion, and bank-link step-up require MFA when enabled; export and deletion are throttled at 5/min
- Mobile export, deletion, and bank-link dialogs collect an authenticator code when MFA is enabled
- Offline replay keeps 408/429 queued instead of treating them as permanent rejects
- Native association files now include AASA `webcredentials` and optional `/.well-known/assetlinks.json` (requires ANDROID_CERT_FINGERPRINTS). Repeated failed assertions on a known passkey now lock further passkey login without affecting password lockout.

## Still open (not claimed complete)

- Native iOS/Android Credential Manager / ASAuthorization ceremony (web is wired; native is an honest stub)
- Physical-device / Safari-Chrome passkey smoke
- External owner gates: production Plaid/Stripe, domains/TLS, SMTP, APNs/FCM, Apple/Android store signing, legal/privacy review, independent pentest, CI on this unpushed branch

## Owner actions required

1. Keep working on `codex/passkey-webauthn-p0`. `main` is still `1a4a9f4`.
2. Push this branch, run CI on that SHA, and only then dispatch release/database-release with that SHA after merge to main.
3. Provision production with a restricted `DATABASE_APP_URL` role that does not own public tables.
4. Provide production provider credentials and signing accounts before calling the system production-ready.
