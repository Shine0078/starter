# FINVERSE threat model

**Version:** 1.0  
**Reviewed against repository:** 2026-08-08  
**Scope:** Flutter mobile client, NestJS API, PostgreSQL, Plaid integration,
email boundary, exports, CI/release artifacts, and cheap-launch operations.

This is an engineering threat model, not a penetration test or compliance
attestation. A production review must update deployment-specific sections after
the host, TLS edge, secret manager, database, email provider, domain, and
support process are selected.

## 1. Security objectives

1. A user can read or change only their own identity and financial records.
2. A stolen access token has a short useful lifetime; refresh-token replay is
   detected and revokes the token family.
3. FINVERSE never receives or stores a user's bank password.
4. A Plaid access token never reaches the mobile client, logs, exports,
   notifications, or ordinary runtime database queries.
5. Financial arithmetic preserves minor units, dates, currency boundaries, and
   provider idempotency.
6. Account erasure removes identity, authentication, bank, and finance data
   after the documented recovery period.
7. Network, provider, and cache failures fail visibly instead of presenting
   guessed or cross-user data.
8. Security and privacy claims never exceed deployed controls.

## 2. Assets

| Asset | Sensitivity | Required protection |
|---|---:|---|
| Plaid access tokens and Item identifiers | critical | encrypted, server-only, least-privilege routing |
| Refresh tokens, MFA seeds, recovery factors | critical | hashed where verification permits; otherwise authenticated encryption |
| Transactions, balances, goals, budgets | high | user isolation, encryption, auditable deletion |
| Email, sessions, IP/user-agent history | high | least privilege, retention controls, no log leakage |
| Offline cache and session credentials | high | keystore key, authenticated encryption, app lock, purge |
| JWT, MFA, bank-token, database and signing secrets | critical | secret manager, rotation, no repository/log exposure |
| Reports and portable exports | high | authenticated generation, deliberate share, temporary-file removal |
| Consent and legal evidence | high | append-only history, version integrity, user isolation |
| Release artifacts and dependencies | high | CI gates, protected signing keys, dependency review |

## 3. Trust boundaries and data flow

```text
[User + device]
  Flutter UI
  OS keystore + encrypted SQLite cache
          |
          | HTTPS in production (deployment responsibility)
          v
[TLS edge / load balancer]
          |
          v
[NestJS API instances]
  authentication, authorization, validation, financial domain
      |             |                 |
      |             | signed webhook | SMTP with TLS
      |             v                 v
      |          [Plaid]          [Email provider]
      |
      | scoped SQL transaction + runtime role
      v
[PostgreSQL]
  RLS user data | auth data | encrypted bank tokens | shared limits/jobs
```

The TLS edge, managed database controls, backup store, secret manager, email
provider, monitoring, and operator-access path do not exist in this repository.
They remain production trust boundaries requiring selection and verification.

## 4. Entry points

- Public API: health, categories, legal policy, registration, login, refresh,
  MFA challenge, email verification/reset request, and Plaid webhook.
- Authenticated API: accounts, transactions, budgets, goals, insights,
  notifications, exports, privacy/consent, sessions, bank connection and sync.
- Mobile/platform: Plaid Link bridge, device authentication, keystore, local
  encrypted cache, file sharing, and URL launch.
- Operations: migrations, purge command, backup/restore scripts, container
  image, CI release workflow, and environment variables.
- Third parties: Plaid API/JWK endpoint, SMTP provider, app stores and future
  billing, push, monitoring, OCR, or LLM providers.

## 5. Threat register

`Mitigated` means covered by repository controls, `partial` requires production
infrastructure or validation, and `open` means a launch control is absent.

| ID | Threat | Impact | Repository controls and evidence | Status / remaining action |
|---|---|---|---|---|
| T01 | Credential stuffing or password brute force | account takeover | Argon2id; password policy; account lockout; PostgreSQL-shared IP throttles; uniform unknown-user response; MFA | **Partial:** validate proxy IP handling and expand compromised-password corpus |
| T02 | Access/refresh token theft | finance-data disclosure | short-lived signed access token; hashed rotating refresh tokens; family revocation on reuse; session revocation; OS secure storage | **Partial:** TLS edge, device acceptance and secret rotation remain |
| T03 | IDOR or missing user predicate | cross-user leak/change | every port takes user id; token-derived identity; restricted PostgreSQL role; forced RLS; adversarial RLS and isolation tests | **Mitigated:** keep RLS tests mandatory for each user table |
| T04 | SQL injection or unsafe query construction | database compromise | parameterized SQL; curated query fields; no client SQL identifiers; runtime role cannot create schema objects or rewrite migrations | **Mitigated:** penetration test remains |
| T05 | Plaid token disclosure from DB, API, logs, or export | long-lived bank-data access | AES-256-GCM token encryption; server-only DTOs; safe export/logging; narrow Item-routing function | **Partial:** KMS/secret manager and production log-sink validation remain |
| T06 | Fake, replayed, or mutated Plaid webhook | unauthorized sync/DoS | exact raw-body ES256 verification; JWK; freshness check; opaque durable jobs; idempotent sync | **Partial:** production URL/TLS and real Plaid delivery test remain |
| T07 | Malicious institution data | stored injection, formula execution, false totals | text rendering; formula-safe CSV; bounded PDF text; safe integers; date/currency validation; idempotent sync | **Partial:** fuzz/provider corpus and reporting audit remain |
| T08 | Provider account edited through manual API | falsified bank balance | persisted provenance; manual endpoints reject provider rows and cross-user ids; API/store tests | **Mitigated** |
| T09 | Cross-currency addition | materially false finance output | money rejects mixed addition; dashboard groups currencies; planning requires explicit ISO currency | **Partial:** monthly insights/budgets/subscriptions need reporting-currency design |
| T10 | Offline cache copied or tampered with | local disclosure/manipulation | user-scoped AES-256-GCM payloads and context; keystore key; expiry; purge; app lock | **Partial:** metadata and rooted-device threat decisions remain |
| T11 | Lost/stolen unlocked device or shoulder surfing | local account access | optional biometric/PIN gate after background; locked finance UI; sign-out path | **Partial:** physical Android/iOS, screenshots and notification-redaction audit remain |
| T12 | Malicious insider or stolen DB credential | bulk disclosure/change | restricted runtime role, RLS, encrypted bank tokens, narrow logs | **Open:** deployed IAM, break-glass, KMS, just-in-time access and audit sink absent |
| T13 | Backup theft or unsafe restore | historic bulk disclosure/corruption | guarded backup and isolated restore scripts | **Open:** encrypted storage, approval, retention and recorded drill need production |
| T14 | Denial of service/resource exhaustion | outage/cost | body/query bounds; route/shared throttles; PDF throttle; load smoke; readiness | **Partial:** edge limits, capacity/soak, provider quotas and alerting remain |
| T15 | Deletion bypass or incomplete erasure | privacy/regulatory harm | password + typed confirmation; immediate revocation; recovery; owner-level erasure proof; purge command | **Partial:** production scheduler and backup-retention procedure remain |
| T16 | Reset/verification interception or enumeration | takeover/privacy leak | hashed one-time expiring tokens; enumeration-safe reset; session revocation | **Partial:** domain, SPF/DKIM/DMARC and provider testing remain |
| T17 | Consent spoofing or stale legal acceptance | unlawful processing | fail-closed versions/HTTPS URLs; atomic user + acceptance; append-only history; optional processing off | **Partial:** counsel-approved documents and retention procedure remain |
| T18 | Sensitive logs, errors, crash reports, analytics | secondary leak | logs omit credentials, bodies, queries, users, merchants and amounts; analytics consent precedes SDK | **Partial:** configure and test production sinks before telemetry |
| T19 | Dependency/build/signing compromise | malicious release | lockfiles; CI gates; non-root container; signing required; no signing secret in repo | **Partial:** protected branches, provenance/scanning and key custody remain |
| T20 | Recommendation presented as certainty/advice | user harm/regulatory exposure | evidence thresholds; conservative forecast; explicit simulator limits; cautious anomaly language | **Open:** counsel must approve positioning and marketing copy |

## 6. Abuse cases that stay in regression tests

- User B supplies User A's transaction, goal, session, notification, or manual
  account id.
- A request adds a user-id header/body property to override the JWT.
- A provider account id is sent to a manual-account mutation endpoint.
- A refresh token, TOTP, or recovery code is replayed.
- A Plaid webhook body changes after signing or has a stale timestamp.
- A CSV cell begins with `=`, `+`, `-`, or `@`.
- A financial total mixes currencies without a rate and rate timestamp.
- A pending transaction changes, settles under a new id, or disappears.
- A SQL query omits its user predicate while runtime RLS scope is active.
- Account purge runs twice or after partial removal.

## 7. Production security acceptance gates

- [ ] Domain/TLS edge configured; HTTPS redirect, HSTS and CORS tested.
- [ ] Secret manager/KMS selected; access, rotation and recovery tested.
- [ ] Managed PostgreSQL runtime/migration roles separated; public access restricted.
- [ ] Encrypted backups scheduled; restore drill recorded; deletion retention reconciled.
- [ ] Operator access is just-in-time, approved, logged, and revocable.
- [ ] Alerts cover readiness, errors, latency, jobs, login abuse and backups without finance payloads.
- [ ] Plaid production Link, update mode, webhook and representative institutions tested.
- [ ] Email domain authentication and reset/verification delivery tested.
- [ ] Android/iOS physical-device security and accessibility acceptance completed.
- [ ] Independent penetration and privacy/legal reviews completed; findings closed.
- [ ] Incident response, user notification, support verification and status communication rehearsed.

## 8. Review triggers

Review before adding billing, push, telemetry, receipt images/OCR, LLM prompts,
investment holdings, family sharing, admin tooling, or a web client. Also review
after an authentication change, a new user-scoped table, deployment-provider
change, security incident, or material Plaid product expansion.
