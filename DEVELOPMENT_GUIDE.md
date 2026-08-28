# FINVERSE Development Guide

## Prerequisites

- Node.js 22 and npm.
- Flutter stable with the Android toolchain for APK builds.
- Docker or the repository's embedded PostgreSQL test dependency for database
  tests.
- Xcode/macOS for iOS builds.

## Install

```bash
npm ci
cd apps/mobile
flutter pub get
```

## Run Locally

From the repository root:

```bash
npm run dev
```

Without database variables, the API uses volatile development memory. For a
persistent local database, configure the owner URL for migrations and a distinct
restricted `DATABASE_APP_URL`, then use the scripts documented in `README.md`.
Never put credentials in chat, commits, logs, or screenshots.

Production statement uploads are queued for the durable analysis worker. The
production default is `STATEMENT_IMPORT_ASYNC=true`; set it explicitly in a
local Postgres environment when you want to exercise the same `202` + polling
flow. Do not disable it in production.

The web client is built and mounted at `/app/`:

```bash
cd apps/mobile
flutter build web --release --no-web-resources-cdn --base-href=/app/
```

## Required Gates

```bash
npm run typecheck --workspace @finverse/api
npm test --workspace @finverse/api
npm run test:db
npm run build --workspace @finverse/api
npm audit --omit=dev

cd apps/mobile
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn --base-href=/app/
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.invalid
```

Migration verification requires owner and restricted application URLs:

```bash
npm run migrate --workspace @finverse/api
npm run migrate --workspace @finverse/api
npm run migrate:verify --workspace @finverse/api
```

## Change Discipline

1. Inspect Git status and preserve unrelated work.
2. Reproduce the failure and state the security or correctness invariant.
3. Add the smallest test that proves the missing behavior.
4. Implement without weakening RLS, validation, or existing tests.
5. Run targeted tests, then the relevant regression gates.
6. Update `CURRENT_STATUS.md`, `KNOWN_ISSUES.md`, and `CHANGELOG.md` when the
   verified state changes.
7. Commit one coherent, tested milestone.
