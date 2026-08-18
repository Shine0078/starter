# FINVERSE status - 2026-08-18 (verified)

Canonical working branch: `codex/passkey-webauthn-p0`
HEAD at write time: tip of `codex/passkey-webauthn-p0` after the LinkKit 7 iOS compile fix and the production npm-audit CI gate.
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
- `WEBAUTHN_ORIGIN` is a comma-separated exact-origin allowlist under one RP ID (HTTPS hosts must equal the RP ID or be a subdomain; `android:apk-key-hash` is accepted)
- Login and settings now call the passkey client. Web uses `navigator.credentials`. Native builds report unsupported instead of inventing a hardware ceremony.

Proven locally after the CI-red fixes on this turn:

- `npx vitest run test/webauthn.spec.ts` - 17 passed, including MFA-enabled enroll after setting `MFA_ENCRYPTION_KEY`
- `npx vitest run test/config.spec.ts test/webauthn.spec.ts test/auth-api.spec.ts` - 117 passed
- `flutter analyze` - no issues
- `flutter test test/widget_test.dart` - 63 passed, including 408/429 staying queued

Observed on GitHub Actions for `97d3c24` ([run 32156076602](https://github.com/Shine0078/starter/actions/runs/32156076602)):

- In-memory API tests passed after the MFA cipher fixture (the previous 503 is gone)
- Flutter analysis, Flutter tests, Android APK, and web/PWA compile succeeded
- Authenticated PostgreSQL load smoke failed because it still called demo `POST /api/sync`, which Postgres correctly rejects with 400
- Unsigned iOS compile failed because `workmanager_apple` references `BGContinuedProcessingTask` and macos-14 does not ship that SDK

Those two remaining CI failures are patched on this branch as `07031ed` and `21a33d7` and were not yet re-run at write time.

Earlier on this branch, still valid unless contradicted above:

- Isolated `npx vitest run test/auth-api.spec.ts` - 70 passed
- Targeted Postgres `webauthn-postgres.spec.ts` + `rls.spec.ts` after migration 030 - 71 passed
- A full `npm run test:db` on `4feb081` passed: **60 files, 1001 tests, 0 failed**
- `npx tsc --noEmit` - pass
- `flutter build web --release --no-web-resources-cdn --base-href=/app/` - succeeded earlier
- `flutter build apk --release --dart-define=API_BASE_URL=https://api.example.invalid` - succeeded earlier

A complete `npm run test:db` has **not** been re-run on `21a33d7`.

## Release / production invariants

- Production requires `DATABASE_APP_URL`, refuses the same role as `DATABASE_URL` when both are set, and refuses SUPERUSER, BYPASSRLS, or a runtime role that owns public tables
- Automatic release remains main/master + 40-character SHA + successful CI
- Manual release and database-release also require that successful CI run to be on main/master in this repository
- `render.yaml` is `finverse-preview` / `finverse-preview-db` and is labeled preview-only
- GitHub Actions used by CI/release are SHA-pinned; GHCR push requests provenance + SBOM
- Image tags are digest-pinned from live registries
- iOS CI now compiles on `macos-26` so the iOS 26 SDK can see `BGContinuedProcessingTask`
- CI fails the API job on high/critical production npm advisories (`npm audit --omit=dev --audit-level=high`); local audit was clean at write time
- Load-smoke no longer calls demo `/api/sync`; Postgres refuses that route and an empty authenticated account is enough for the restricted-role read path

## Mobile / offline

- Rejected 4xx replays increment `rejectedMutationCount` and are shown with dedicated rejected copy
- Home banner can dismiss rejected mutations
- Rejected mutation list is cleared on sign-out / session restore
- Concurrent replay is serialized
- Offline replay keeps 408/429 queued instead of treating them as permanent rejects
- Cached GET fallbacks await the Future so `flutter analyze` stays clean
- iOS xcconfig comments use `//` so Xcode does not treat `# Replace` / `# before` as preprocessor directives

- Registration requires the AT flag and `body.id` to match the attested credential id
- Passkey enroll/remove routes are throttled at 10/min
- Migration 030 drops unused `webauthn_challenges.failed_attempts` and grants EXECUTE on `finverse_webauthn_credential_owner` when `finverse_app` exists
- Passkey enroll consumes MFA only on options; verify re-checks the password against the issued ceremony
- Export, account deletion, and bank-link step-up require MFA when enabled; export and deletion are throttled at 5/min
- Mobile export, deletion, and bank-link dialogs collect an authenticator code when MFA is enabled
- Native association files include AASA `webcredentials` and optional `/.well-known/assetlinks.json` (requires ANDROID_CERT_FINGERPRINTS). Repeated failed assertions on a known passkey lock further passkey login without affecting password lockout.

## Still open (not claimed complete)

- CI on the latest SHA after the LinkKit 7 iOS compile fix (in progress after push). macos-26 cleared BGContinuedProcessingTask, then failed on stale Plaid success metadata until `f52fbc2`.
- Native iOS/Android Credential Manager / ASAuthorization ceremony (web is wired; native is an honest stub)
- Physical-device / Safari-Chrome passkey smoke
- External owner gates: production Plaid/Stripe, domains/TLS, SMTP, APNs/FCM, Apple/Android store signing, legal/privacy review, independent pentest
- Merge to `main` before release/database-release can publish

## Owner actions required

1. Keep working on `codex/passkey-webauthn-p0`. `main` is still `1a4a9f4`.
2. Wait for CI on the pushed SHA. Dispatch release/database-release only after that SHA is merged to main and the same-repo main/master CI is green.
3. Provision production with a restricted `DATABASE_APP_URL` role that does not own public tables.
4. Provide production provider credentials and signing accounts before calling the system production-ready.
