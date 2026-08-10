# Launch operations

This is the provider-neutral, low-cost shipping path. It packages and verifies the
software without pretending that a cloud account, domain, bank contract, email
provider, or legal approval already exists.

## Artifacts now produced

- `Dockerfile` builds the NestJS API as a non-root Node 22 image with an HTTP
  health check.
- `.github/workflows/release.yml` publishes tagged API images to this repository's
  GitHub Container Registry, uploads a release APK signed with the configured
  Android upload key, and publishes a same-origin `/app/` Flutter web/PWA bundle
  as a release artifact.
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
MFA_ENCRYPTION_KEY=<32 random bytes, base64 encoded>
CORS_ORIGINS=https://your-domain.example
MIGRATE_ON_BOOT=false
TRUST_PROXY_HOPS=1
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<provider username>
SMTP_PASSWORD=<provider secret>
EMAIL_FROM=FINVERSE <no-reply@your-domain.example>
LEGAL_TERMS_VERSION=<immutable reviewed version id>
LEGAL_TERMS_URL=https://your-domain.example/legal/terms/<version>
LEGAL_PRIVACY_VERSION=<immutable reviewed version id>
LEGAL_PRIVACY_URL=https://your-domain.example/legal/privacy/<version>
PLAID_CLIENT_ID=<Plaid production client id>
PLAID_SECRET=<Plaid production secret from a secret manager>
PLAID_ENVIRONMENT=production
PLAID_COUNTRIES=CA,US
BANK_TOKEN_ENCRYPTION_KEY=<32 random bytes, base64 encoded>
PLAID_WEBHOOK_URL=https://api.your-domain.example/api/bank-webhooks/plaid
```

The production API refuses to start with the in-memory store, without the
restricted `DATABASE_APP_URL`, or with migrations enabled on boot. The runtime
container does not need the schema-owner `DATABASE_URL`; provide that credential
only to the separate migration job.

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

Production also refuses to start without both reviewed legal documents, immutable
version ids, and HTTPS URLs. The mobile app fetches these through `GET /api/legal`,
requires both acknowledgements, and the API commits them atomically with the user.

Plaid access tokens are encrypted with AES-256-GCM before persistence. Treat
`BANK_TOKEN_ENCRYPTION_KEY` as a production encryption key: store it in the host's
secret manager, back it up separately, and plan rotation before launch. Webhooks are
verified against Plaid's ES256 JWK, bound to the exact raw request body, deduplicated
within a delivery-retry window, and processed through a durable PostgreSQL queue.

Production rate limits also use PostgreSQL. Migration `011_rate_limits.sql`
creates opaque fixed-window counters shared by all API instances; Nest hashes
the route and tracker before persistence, so raw IP addresses are not stored.
The development memory path stays process-local. No Redis service is required
for the current low-cost architecture.

Treat `MFA_ENCRYPTION_KEY` with the same care, but keep it distinct from the bank
token key. Losing it prevents MFA-enabled users from signing in; disclosing it
exposes authenticator seeds if the database is also compromised. Recovery codes
remain SHA-256 hashes and cannot be recovered from the database.

## Release sequence

1. Run the complete CI suite.
2. Back up PostgreSQL and record the archive location.
3. Run `npm run migrate --workspace @finverse/api` with both database URLs set.
4. Deploy the tagged GHCR image using only the restricted runtime database URL.
5. Confirm `/healthz` returns HTTP 200. It returns HTTP 503 when PostgreSQL is not
   reachable, so the platform can stop routing traffic to an unhealthy instance.
6. Schedule `npm run purge:accounts --workspace @finverse/api` daily. The
   production image runs the compiled `dist/` command; source-only local work
   can use `npm run purge:accounts:dev --workspace @finverse/api`.
7. Schedule daily backups and a recurring restore drill to a disposable
   `_restore_test` database.

## Cheap public HTTPS path for the phone

The repository includes [`infra/docker-compose.public.yml`](../infra/docker-compose.public.yml)
and [`infra/Caddyfile`](../infra/Caddyfile) for a small VPS or any Docker host
with a public IPv4/IPv6 address. It runs the tagged API image behind Caddy, keeps
port 3000 private to the Docker network, and obtains/renews HTTPS automatically
for `PUBLIC_API_DOMAIN`. The database is deliberately not bundled into this
stack: use a managed PostgreSQL provider so backups, storage encryption, and
restore access are not tied to a single cheap server.

```powershell
Copy-Item infra/.env.production.example infra/.env.production
# Edit infra/.env.production and set every placeholder, then:
$env:FINVERSE_API_IMAGE = "ghcr.io/OWNER/REPOSITORY-api:v1.0.0"
$env:PUBLIC_API_DOMAIN = "api.your-domain.example"
docker compose --env-file infra/.env.production -f infra/docker-compose.public.yml config
docker compose --env-file infra/.env.production -f infra/docker-compose.public.yml up -d
```

Point the domain's DNS A/AAAA record at the host before starting Caddy. Then
build the phone app with the same origin:

```powershell
flutter build apk --release `
  --dart-define=API_BASE_URL=https://api.your-domain.example
```

This removes the Tailscale/VPN dependency for a physical iPhone. A domain,
public host, and managed database are still owner-supplied infrastructure; the
repository cannot create those accounts or certificates locally.

## Load-smoke gate

`npm run load:smoke` boots the real Nest application, registers an isolated
test account, imports the deterministic ledger, and exercises authenticated
accounts, transactions, budgets, insights, subscriptions, health, forecast, and
notification routes concurrently. It reports throughput and p50/p95/p99 latency
and exits non-zero on any HTTP failure or when `LOAD_P95_MS` is exceeded.

The command defaults to the memory adapter. If a database URL is present it
refuses to run without `LOAD_TEST_DATABASE=true`; non-local database hosts also
require `LOAD_TEST_REMOTE=true`. Use only an isolated staging database. CI runs
160 requests at concurrency 8 against PostgreSQL with a 750 ms p95 ceiling.

## Still external

The workflow creates release artifacts; it does not select or mutate a hosting
provider. Launch still needs a domain/TLS edge, managed PostgreSQL, encrypted object
storage for backups, a production email provider, error/uptime monitoring, secrets
management, and the user-owned credentials for those services.
