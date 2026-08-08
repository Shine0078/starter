# Launch operations

This is the provider-neutral, low-cost shipping path. It packages and verifies the
software without pretending that a cloud account, domain, bank contract, email
provider, or legal approval already exists.

## Artifacts now produced

- `Dockerfile` builds the NestJS API as a non-root Node 22 image with an HTTP
  health check.
- `.github/workflows/release.yml` publishes tagged API images to this repository's
  GitHub Container Registry and uploads a release APK signed with the configured
  Android upload key.
- CI type-checks, tests with both stores, applies migrations twice, builds the API,
  analyzes/tests Flutter, and compiles the Android release target.
- `infra/scripts/backup-postgres.ps1` creates a compressed custom-format PostgreSQL
  backup, validates its archive structure, and rolls off files older than the chosen
  retention window.
- `infra/scripts/restore-drill-postgres.ps1` restores only to a database whose name
  ends in `_restore_test`, then verifies migration history is readable.

## Required production configuration

Run migrations as a release step with the privileged `DATABASE_URL`. Run the API
with the restricted `DATABASE_APP_URL` and `MIGRATE_ON_BOOT=false`.

Required values:

```text
NODE_ENV=production
STORE=postgres
DATABASE_URL=postgresql://schema-owner:...@.../finverse
DATABASE_APP_URL=postgresql://finverse-app:...@.../finverse
JWT_SECRET=<at least 32 random characters>
CORS_ORIGINS=https://your-domain.example
MIGRATE_ON_BOOT=false
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<provider username>
SMTP_PASSWORD=<provider secret>
EMAIL_FROM=FINVERSE <no-reply@your-domain.example>
```

GitHub release variables/secrets:

```text
Repository variable: API_BASE_URL=https://api.your-domain.example
ANDROID_KEYSTORE_BASE64
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
ANDROID_STORE_PASSWORD
```

Keep the original Android upload keystore outside the repository in two backed-up,
access-controlled locations. Losing it can prevent future app updates.

Production uses the SMTP `EmailSender` adapter and refuses to start when its required
settings are absent. Development prints one-time codes locally. Run a deliverability
test (SPF, DKIM, DMARC, inbox and spam placement) before inviting users.

## Release sequence

1. Run the complete CI suite.
2. Back up PostgreSQL and record the archive location.
3. Run `npm run migrate --workspace @finverse/api` with both database URLs set.
4. Deploy the tagged GHCR image using only the restricted runtime database URL.
5. Confirm `/healthz` returns HTTP 200. It returns HTTP 503 when PostgreSQL is not
   reachable, so the platform can stop routing traffic to an unhealthy instance.
6. Schedule `npm run purge:accounts --workspace @finverse/api` daily.
7. Schedule daily backups and a recurring restore drill to a disposable
   `_restore_test` database.

## Still external

The workflow creates release artifacts; it does not select or mutate a hosting
provider. Launch still needs a domain/TLS edge, managed PostgreSQL, encrypted object
storage for backups, a production email provider, error/uptime monitoring, secrets
management, and the user-owned credentials for those services.
