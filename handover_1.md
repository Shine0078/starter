# FINVERSE — Adversarial Engineering Handover 1

**File:** `handover_1.md`  
**Project root:** `C:\Users\samue\OneDrive\Desktop\starter`  
**Prepared:** 2026-08-18  
**Purpose:** Canonical engineering handover, adversarial review, remediation plan, and validation gates.

> Treat this file as the current engineering source of truth until it is deliberately superseded by a newer handover. Do not trust older completion claims without re-verifying them against the repository and tests.

## 1. Executive assessment

FINVERSE is a substantial personal-finance platform rather than a prototype. The repository contains a NestJS/TypeScript API, Flutter mobile/web client, PostgreSQL persistence and row-level security, bank aggregation, Stripe billing, authentication/session rotation, MFA, WebAuthn/passkeys, receipts/OCR, budgeting, goals, analytics, offline encrypted storage, push infrastructure, privacy/export/deletion flows, cloud/container configuration, tests, and extensive documentation.

The finance core and much of the security architecture are strong. Production configuration is generally fail-closed, money handling is careful, RLS is thoughtfully designed, banking tokens are encrypted, sensitive webhooks are verified, and the mobile cache/session design shows good security awareness.

However, the repository must **not** be treated as production-ready for real financial users yet. The most important weakness is not missing features; it is adversarial integration correctness. The passkey flow currently contains several high-impact integration defects that are easy for isolated unit tests to miss.

### Current severity summary

- **P0 / release-blocking:** passkey login contract, RLS-safe credential lookup, normal session issuance after WebAuthn, shared challenge storage, strong user verification, step-up for passkey management, full PostgreSQL/RLS end-to-end coverage.
- **P0 / release engineering:** releases should be gated by verified CI; production must never run through a database-owner path.
- **P1:** canonical documentation, offline mutation failure semantics, supply-chain pinning/provenance, full device/browser validation, production provider configuration.
- **P2:** independent penetration test, legal/privacy review, incident response, disaster recovery exercise, load/failure testing, observability hardening, secret/KMS lifecycle, app-store/provider approvals.

## 2. Repository state observed during review

At review time the repository was clean on `master`, tracking `origin/master`. The latest observed commit was `0ba4ee4`, tagged `v0.1.0`, with message `feat(platform): complete enterprise finance and product capabilities`.

Approximately 520 tracked files were present. Local sensitive/generated files checked during review — including API `.env`, Android signing/local properties, local PostgreSQL data, build outputs, and dependency directories — were not tracked and were covered by ignore rules. This is good; do not weaken those rules.

Important documentation reviewed included:

- `README.md`
- `HANDOVER-CURRENT.md`
- `Not Complete list .md`
- `docs/12-mission2-audit.md`
- `MISSION1.md` and `MISSION2.md`
- `.gitignore`
- API/mobile package and configuration files

A major operational issue is **documentation drift**. Several documents sound authoritative while disagreeing about deployment state, test counts, passkey readiness, and which mission files exist. Some older documentation claims `MISSION1` is missing although it exists now. Future automation must prefer verified repository state over prose.

## 3. What is already engineered well

The following areas should generally be preserved and strengthened rather than replaced casually:

- Production configuration rejects weak/default JWT secrets and unsafe persistence modes.
- Production refuses in-memory storage and migration-on-boot behavior.
- Production expects a restricted database application role instead of an owner/superuser path.
- PostgreSQL policies use `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY` where reviewed.
- Runtime-role tests verify the role is not `SUPERUSER` and does not have `BYPASSRLS`.
- `withUserScope` uses transaction-local user context for tenant isolation.
- Auth uses Argon2, timing equalization, access/refresh tokens with session IDs, atomic refresh rotation, replay-family revocation, lockout/throttling, enumeration-safe password reset, hashed one-time action tokens, TOTP MFA, recovery codes, and account deletion/recovery/purge controls.
- Banking/provider secrets are encrypted at rest with AES-GCM.
- Plaid/Stripe-style webhook paths use signed raw-body verification.
- Money uses integer minor units with explicit currency separation; timezone/date handling and CSV-injection defenses are tested.
- HTTP controls include no-store responses for sensitive API traffic, HSTS in production, `nosniff`, CSP/frame protections, correlation IDs, constrained metrics, and careful compression behavior.
- Mobile offline data is encrypted before SQLite persistence, uses secure key storage, partitions by owner, and has sign-out protections intended to prevent stale-session resurrection.

These are important foundations. Remediation should be surgical: preserve the good security invariants, add missing integration guarantees, and avoid rewriting mature subsystems without evidence.

## 4. P0 finding — passkey login HTTP endpoints are not actually public

### Evidence

`AppModule` registers the normal authentication guard globally. Routes that must be callable before login therefore need the project's `@Public()` exemption.

The WebAuthn controller exposes public status information, while registration endpoints are appropriately authenticated. However, the reviewed `POST login/options` and `POST login/verify` routes did **not** have `@Public()`.

### Impact

A passwordless login ceremony cannot begin unless the caller already has a valid bearer session. That defeats the purpose of passkey login and can make the feature look healthy in isolated tests while failing from a fresh client.

### Required fix

1. Mark only the pre-authentication WebAuthn login routes public.
2. Keep registration, credential listing, rename, and removal routes authenticated.
3. Add strong pre-auth rate limiting and abuse controls to public passkey endpoints.
4. Do not weaken the global guard or make the whole WebAuthn controller public.
5. Add HTTP-level tests that prove login options and login verification work with **no Authorization header**.
## 5. P0 finding — PostgreSQL WebAuthn lookup conflicts with forced RLS

### Evidence

The reviewed PostgreSQL credential store performs credential-ID lookup using a direct query similar to `SELECT ... FROM webauthn_credentials WHERE credential_id = $1`.

The `webauthn_credentials` table is protected by forced RLS with ownership based on the current FINVERSE user context. The existing RLS tests demonstrate that an unscoped runtime-role query sees zero protected rows. Therefore a pre-auth lookup by credential ID has no user scope and can fail in the production-style restricted role even though it works against an in-memory store.

### Impact

Passkey verification can become impossible specifically in the secure production configuration. This is a classic environment/integration bug: the security mechanism correctly blocks a query that the authentication design incorrectly expects to succeed.

### Required fix

Implement a deliberately narrow pre-auth routing mechanism rather than bypassing RLS globally. Preferred design:

- Add a narrowly scoped `SECURITY DEFINER` database function dedicated to WebAuthn credential routing/verification.
- Lock its `search_path` and permissions explicitly.
- Grant execute only to the restricted application role.
- Return only the minimum data required to verify the assertion and resolve the owning user; never expose arbitrary user or credential listings.
- Validate credential ID input and return a single deterministic result.
- Keep normal post-auth credential operations behind ordinary user-scoped RLS.
- Add migration tests proving the function cannot be abused to enumerate unrelated protected rows.

The repository already uses narrow ownership-routing functions for webhook cases; follow that defensive pattern rather than introducing a broad RLS bypass.

## 6. P0 finding — successful WebAuthn assertion does not establish a normal FINVERSE session

The reviewed WebAuthn login verification returns identity information such as `userId` and `credentialId`, but it does not complete the same session/token issuance path used by standard authentication.

A cryptographically valid assertion is only an authentication proof. The application still needs to perform account-status checks, create/rotate the correct session record, issue normal access and refresh tokens, apply security logging, and return the response contract expected by the client.
### Required fix

Create a dedicated authentication-service entry point for successful WebAuthn assertions. It should reuse the normal session model instead of inventing a second passkey-only session format.

After assertion verification it must, at minimum:

1. Resolve the user through the safe credential-routing mechanism.
2. Reject disabled, deleted, locked, or otherwise ineligible accounts according to the same policy as other login methods.
3. Update WebAuthn signature-counter/credential metadata atomically where applicable.
4. Create a normal FINVERSE session and issue the standard access/refresh token pair.
5. Record authentication/security telemetry without logging secrets or raw assertion material.
6. Return a response that the mobile/web clients can consume exactly like another successful login method.
7. Prove the resulting token by calling an authenticated endpoint such as `/auth/me` in an end-to-end test.

## 7. P0 finding — WebAuthn challenge storage is process-local

The reviewed service keeps pending challenges in an in-memory `Map` with a short TTL and keys such as registration/login identifiers.

### Impact

This is fragile under restart, horizontal scaling, rolling deployments, multiple Node workers, or load balancing. The request that creates a challenge and the request that verifies it may land on different processes, causing intermittent failures. Process-local state also makes atomic one-time consumption harder to reason about under concurrency.

### Required fix

Move challenge state into a shared, expiring store. PostgreSQL is acceptable for the current architecture; Redis is also valid if introduced deliberately.

Each challenge record should use a cryptographically random opaque ceremony ID, include purpose (`register` or `login`), expiration, relevant user/credential binding where appropriate, and a consumed state. Verification must consume it atomically so replay loses the race.

Never key the primary challenge record only by mutable human identifiers such as email address. Never store raw sensitive client secrets in logs.
## 8. P0 finding — passkey user verification is too weak for primary financial login

The reviewed options prefer user verification rather than requiring it, and the verifier checks user presence while not clearly enforcing the WebAuthn UV flag.

For a passkey acting as a primary authentication factor to financial data, this should be a deliberate security decision rather than an accidental default.

### Required fix

- Prefer `userVerification: 'required'` for primary passkey authentication unless a documented compatibility decision says otherwise.
- Verify both user presence and user verification flags as required by the chosen policy.
- Test platform authenticators and cross-platform authenticators on supported browsers/devices.
- Document any fallback behavior explicitly; never silently downgrade security.

## 9. P0 finding — passkey enrollment/removal needs step-up authentication

A bearer session alone was sufficient in the reviewed flow to reach passkey management operations. For a finance application, adding or deleting a strong authentication factor is a high-risk account action.

### Required fix

Require recent step-up authentication before enrollment and destructive credential removal. Acceptable factors can include a recent password confirmation, existing passkey assertion, or MFA challenge depending on account state.

Also:

- Record the security event.
- Notify the user when a passkey is added or removed.
- Make credential names/devices visible enough for account review.
- Prevent removal of the last viable recovery/authentication method without an explicit safe recovery path.
- Rate-limit management attempts and reject stale step-up proofs.

## 10. P0 test gap — existing WebAuthn tests mask the real failure mode

The reviewed WebAuthn test path uses the in-memory store for important cases. That validates cryptographic logic but not the production integration contract.
### Required PostgreSQL/RLS WebAuthn integration test

Add a real database-backed end-to-end test using the restricted runtime role and forced RLS. It should execute the complete path:

1. Create a test user through supported setup fixtures.
2. Register a credential or insert a valid credential through an approved test fixture.
3. Start passkey login **without an Authorization header**.
4. Receive a challenge/ceremony identifier.
5. Generate a valid WebAuthn assertion in the test harness.
6. Verify it through the real controller/service/store path.
7. Resolve the credential owner while the app is operating under the restricted role.
8. Receive normal access/refresh credentials.
9. Call `/auth/me` and prove the returned access token authenticates the expected user.
10. Reuse the same challenge and prove replay is rejected.
11. Try an invalid credential, wrong origin/RP ID, expired challenge, missing UV, and cross-user manipulation and prove each fails safely.

This test is a release gate. In-memory success must never be accepted as proof that production passkey login works.

## 11. P0 release engineering — published artifacts are not structurally gated by CI

The reviewed release workflow can trigger from a version tag or manual dispatch and then build/publish API/container, Android, and web artifacts. It does not provide a sufficiently explicit dependency on the complete verified CI state.

### Required fix

Choose one auditable release architecture:

- Make release call a reusable CI workflow and continue only after every required verification job succeeds; or
- Trigger release from a successful CI `workflow_run` for an immutable commit/tag and verify that the exact SHA is the one being published.

Release gates should include API typecheck/build/tests, database/RLS tests, Flutter analyze/tests, web build, Android build where available, secret/config validation, migration validation, and security/dependency checks appropriate to the repository.

Never publish from a working tree or commit that did not pass the exact required gate set.
## 12. P0 production invariant — never run the application as database owner

The current RLS strategy only protects users if the runtime connection uses the intended restricted application role. Preserve this as a hard production invariant.

### Required controls

- Production must require `DATABASE_APP_URL` or the equivalent restricted-role connection.
- Fail startup if production resolves to an owner, superuser, or `BYPASSRLS` role.
- Keep migrations/admin operations on a separate privileged connection and separate operational path.
- Add a startup or health diagnostic that verifies the runtime role's critical privileges without exposing credentials.
- Keep tests that prove protected tables cannot be read across users through unscoped runtime queries.
- Never “fix” WebAuthn or webhook routing by changing the main app connection to an owner role.

## 13. P1 supply-chain and artifact hardening

The reviewed automation uses mutable GitHub Action major tags and mutable container-image tags in places. This is common but weaker than a fully hardened release chain.

### Recommended hardening

- Pin third-party GitHub Actions to reviewed commit SHAs; use update tooling to keep them current.
- Pin important build/runtime images by digest where operationally reasonable.
- Generate an SBOM for release artifacts/container images.
- Add artifact/container signing and verifiable provenance/attestations.
- Add dependency and secret scanning with explicit severity policy.
- Review transitive dependency changes before release rather than treating lockfile churn as routine.
- Protect release tags and production environments with GitHub environment rules/approvals appropriate to the project.
- Document the procedure for rotating a compromised dependency, token, signing key, or container credential.

## 14. P1 Render/deployment configuration is preview-only

The reviewed `render.yaml` is explicitly development/free-preview oriented: development environment, migration-on-boot behavior, sandbox bank integration, and manual secrets are present.

That is acceptable for a preview if it remains clearly separated from production. It is dangerous if someone later assumes the file is a production blueprint.
### Required deployment separation

Create an unmistakable boundary between preview and production:

- Name preview configuration as preview/dev where possible.
- Production uses `NODE_ENV=production` and satisfies every fail-closed config requirement.
- Production migrations execute as an explicit release/operations step, not uncontrolled application boot behavior.
- Production uses the restricted runtime DB role.
- Production provider environments/keys, legal URLs, email, push, bank aggregation, billing, storage, domains, and Apple/Android signing are managed through approved secrets/configuration.
- Add a deployment checklist that verifies the exact environment before real-user traffic is enabled.

## 15. P1 documentation drift — establish one source of truth

This repository has accumulated multiple status/handover/audit documents whose claims conflict. For an autonomous coding workflow this is more than cosmetic: an agent can confidently follow stale instructions and regress the system.

### Required fix

Use this file as the canonical starting handover until a newer numbered handover supersedes it. Then:

- Reconcile `README.md`, `HANDOVER-CURRENT.md`, mission/audit documents, and incomplete-task lists against the actual code.
- Clearly label historical audit documents as historical rather than current.
- Remove or correct claims that can be mechanically proven false.
- Put volatile metrics such as test counts, build state, deployment state, and outstanding blockers in one canonical status section.
- Prefer links to tests/scripts that prove a capability over prose saying “complete.”
- Consider CI-generated status evidence for critical gates.
- Never delete useful historical reasoning solely to make documentation look cleaner; archive it with dates instead.

## 16. P1 offline mutation replay needs explicit failure/conflict semantics

The Flutter client queues certain mutations after timeout/client-network failures and stores the queued data encrypted. This is useful, but the correctness contract must make later rejection visible.

### Required behavior

A queued write is **pending**, not successful. The UI must not imply server confirmation until replay is accepted.
Recommended replay rules:

- Persist an operation identifier/idempotency key when server semantics support it.
- Distinguish retryable transport/5xx failures from permanent 4xx validation/authorization/conflict failures.
- Stop blindly retrying permanent failures.
- Surface rejected/conflicted operations to the user with a recoverable action.
- Preserve operation ordering where one mutation depends on another.
- Make logout/account switching clear or quarantine pending writes so one owner can never replay another owner's mutations.
- Test duplicate replay, process death, token refresh during replay, 409/412 conflict, validation failure, revoked session, and server acceptance followed by lost client response.
- Add telemetry for queue depth, oldest pending operation, repeated replay failure, and permanent rejection without logging financial payloads.

## 17. P1 account-enumeration/privacy review

The password-reset path reviewed uses enumeration-safe behavior, which should be preserved. Registration behavior may still reveal whether an email already exists through conflict responses.

This is not equivalent to an authentication bypass, but it can leak account-membership information. Decide the product policy deliberately. If reducing enumeration is desired, normalize registration messaging and timing while still giving an already-registered user a safe route to sign in or recover access.

## 18. P1 observability and security-event requirements

Before production, ensure the system can answer: what failed, which component failed, whether user data was affected, and whether suspicious authentication/payment/banking activity occurred — without recording secrets.

Recommended security events include successful/failed login classes, refresh-token replay-family revocation, MFA/passkey enrollment/removal, password/email/security-setting changes, recovery events, account deletion/recovery, provider-link changes, webhook signature failures, repeated RLS authorization failures, and privileged operational actions.

Do not log passwords, JWTs, refresh tokens, raw bank tokens, TOTP seeds, recovery codes, WebAuthn challenges/assertions, card/bank secrets, or full sensitive provider payloads.

## 19. P2 production-readiness work beyond code correctness

Before handling real financial users, plan and execute:

- Independent penetration testing focused on auth, tenant isolation/RLS, provider webhooks, session lifecycle, mobile storage, API abuse, and account recovery.
- Threat-model review for account takeover, malicious client, compromised provider webhook, stolen mobile device, insider/operator risk, and dependency compromise.
- Backup/restore and disaster-recovery exercise with measured RPO/RTO.
- Load, soak, concurrency, retry-storm, provider-outage, and degraded-network tests.
- Incident-response runbook and contact/escalation ownership.
- Secret/KMS/key-rotation lifecycle, including bank-token encryption and signing credentials.
- Privacy/legal review, retention policy, data-export/deletion verification, consent disclosures, and provider terms.
- App-store privacy/security declarations and provider production approvals.
- Physical-device validation on representative supported iOS/Android devices and Safari/Chrome-class browsers.
- Production alerting for authentication anomalies, webhook failures, provider sync degradation, queue backlog, database saturation, error-rate spikes, and backup failures.

## 20. Test/tool observations from the adversarial review

The following statements describe what was actually observed during the review and should not be inflated into broader claims:

### API static/type validation

`npm run typecheck --workspace @finverse/api` completed successfully.

### Normal API test suite

`npm test` was launched and a large number of tests passed across authentication, stores, sync, insights, CSV handling, banking, metrics, export/privacy, and related modules. PostgreSQL-specific cases that require `TEST_DATABASE_URL` were skipped in that ordinary run.

The WebAuthn crypto-oriented tests passed in memory mode. This does **not** disprove the production integration defects described above.

### Database-backed test suite

`npm run test:db --workspace @finverse/api` successfully launched an embedded PostgreSQL instance and extensive database/API tests were passing while inspected. The long-running harness was intentionally terminated before the complete suite finished, so **do not claim a fresh full `test:db` pass from this review**.

A Node deprecation warning was observed around spawning a child process with `shell: true` (`DEP0190`). Treat this as a minor test-harness hardening item: avoid passing untrusted/variable arguments through shell-enabled child-process invocation and update the harness to a safer spawn contract.

### Flutter validation

`flutter pub get` completed. Dependency resolution reported multiple newer package versions outside current constraints.

`flutter analyze` was started but did not produce a completed result during the inspection window and was intentionally terminated. Consequently, **do not claim a fresh complete Flutter analyze/test pass from this review**.
### Secret-handling observation

Local API environment files, Android signing/local-property files, local database data, build outputs, and dependency directories checked during the review were ignored/untracked. They were **not observed as leaked Git history content**. Preserve the ignore rules and still run secret scanning before release.

## 21. Recommended implementation sequence

Do not attack every issue simultaneously. Use a controlled sequence so failures can be attributed to a specific change.

### Phase 0 — establish baseline and protect the branch

- Re-read this handover and inspect the current repository state; do not assume the commit is still `0ba4ee4`.
- Run `git status`, capture branch/HEAD, and inspect any user changes before editing.
- Never delete or overwrite unrelated local work.
- Create a focused working branch if the repository workflow supports it.
- Run the fastest baseline checks first and record failures that already exist.
- Identify the exact WebAuthn controller/service/store/migration/test files before editing.

### Phase 1 — specify the passkey contract before implementation

Write down the intended request/response and security contract for:

- authenticated passkey registration;
- unauthenticated passkey login options;
- unauthenticated passkey login verification;
- challenge issuance/expiry/atomic consumption;
- credential owner resolution under forced RLS;
- normal session issuance after a valid assertion;
- step-up enrollment/removal;
- audit/security events and user notifications.

The implementation should follow this contract, not evolve route-by-route without a coherent end state.

### Phase 2 — build the database-safe pre-auth credential-routing primitive

Create the migration and store-layer abstraction first. Keep the function minimal, lock its `search_path`, grant only necessary execute permission, and test it under the restricted runtime role before wiring it into login.
### Phase 3 — replace process-local challenge state

Introduce the shared challenge store with opaque ceremony IDs, TTL, purpose binding, and atomic consume semantics. Add concurrency/replay/expiry tests before using it from the controller.

### Phase 4 — repair WebAuthn login end-to-end

- Make only login pre-auth routes public.
- Require the chosen user-verification policy.
- Resolve the credential owner through the safe routing primitive.
- Verify origin/RP ID/challenge/type/credential and signature requirements.
- Atomically update credential metadata/counters where applicable.
- Route successful authentication through normal account eligibility and session issuance.
- Return the standard login token/session contract.
- Add security events and safe rate limiting.

### Phase 5 — harden passkey lifecycle management

Add recent step-up proof for enrollment/removal, security notifications, safe last-credential/recovery handling, management rate limits, and negative tests for stolen/stale sessions.

### Phase 6 — build the PostgreSQL/RLS E2E release gate

Do not move on until the real database-backed full login ceremony passes using the restricted application role, including replay and cross-user negative cases.

### Phase 7 — repair release/deployment guarantees

Gate release on CI for the exact SHA, separate owner migrations from runtime DB access, strengthen action/image pinning, add scan/SBOM/provenance work, and make preview-versus-production configuration unmistakable.

### Phase 8 — mobile/offline correctness and full client validation

Harden pending/rejected/conflict UI semantics, replay/idempotency behavior, account-switch isolation, then run Flutter analyze/tests and build supported web/Android outputs. Validate passkey/auth flows from real clients rather than API tests alone.

### Phase 9 — reconcile documentation

Only after code/tests establish the truth, update README/status/handover material. Do not edit docs first to claim a future state.
## 22. Definition of done for the P0 passkey remediation

Do not mark the passkey work complete until all of these are true:

- A fresh unauthenticated client can request login options.
- A fresh unauthenticated client can submit a valid assertion.
- Invalid/missing/expired/replayed challenges fail.
- Required UV/UP policy is enforced.
- Wrong origin/RP ID fails.
- Unknown or cross-user credentials fail without tenant-data disclosure.
- Credential owner resolution works under the restricted runtime role with forced RLS.
- No broad RLS bypass or owner-role runtime connection is introduced.
- Successful assertion issues the same normal FINVERSE session/token contract expected by the application.
- The issued access token successfully reaches `/auth/me` for the correct user.
- Refresh rotation/revocation semantics continue to work for sessions created by passkey login.
- Enrollment/removal requires recent step-up authentication.
- Enrollment/removal emits the expected security event/notification.
- Shared challenge storage works across separate application instances/processes.
- Concurrent verification can consume a challenge only once.
- PostgreSQL/RLS E2E tests exercise all of the above.
- Existing password/MFA/session flows remain green.

## 23. Definition of done for a production-candidate build

A build may be called a **production candidate** only when:

- repository status is clean and the exact candidate SHA is known;
- required API typecheck/build/tests pass;
- required PostgreSQL/RLS tests pass completely;
- Flutter analyze and required Flutter tests pass completely;
- required web and Android builds complete from the same verified SHA;
- production configuration validation passes with no unsafe fallback;
- runtime DB role is proven restricted;
- migrations are validated independently from runtime boot;
- dependency/secret/security scans satisfy the defined severity policy;
- release workflow proves the exact SHA passed its required CI gate before publishing;
- preview configuration cannot be mistaken for production configuration;
- supported physical-device/browser smoke tests have been completed;
- backup/restore, alerting, and incident-response ownership are documented;
- provider production credentials/approvals, domains, email, push, signing, legal/privacy, and store requirements are complete or explicitly listed as external blockers;
- no documentation claims a gate passed unless there is current evidence.

Passing automated tests alone is necessary but not sufficient for a finance product to be called production-ready.

## 24. Engineering rules for autonomous implementation

Any coding agent or human continuing from this handover should follow these rules:

1. **Verify before editing.** Read the real implementation and tests first.
2. **Never trust completion prose over code/tests.** Historical docs may be stale.
3. **Preserve unrelated user work.** Do not reset, clean, checkout over, or delete changes you did not create.
4. **Use small, reviewable changes.** One coherent security/correctness unit per commit is preferred.
5. **Test after each major change.** Do not stack ten speculative fixes and debug them together.
6. **Never weaken security to make a test green.** Especially RLS, auth guards, TLS/security headers, signing checks, encryption, or production fail-closed config.
7. **Do not switch production runtime to DB owner.** Fix routing contracts correctly.
8. **Do not expose secrets in logs, fixtures, commits, screenshots, docs, or generated reports.**
9. **Do not fabricate test results.** If a suite was not completed, say so.
10. **Treat warnings as signals, not automatic blockers.** Investigate and classify them.
11. **Prefer targeted tests first, then broader regression suites.**
12. **Use separate reviewers/adversarial agents for security-sensitive work when available.** The implementing agent should not be the only reviewer.
13. **Do not let parallel agents edit the same files concurrently.** Delegate research/review/test analysis in parallel; serialize overlapping writes.
14. **Resolve conflicting agent recommendations using repository evidence, standards, and tests — not model voting.**
15. **Stop only for genuine external gates, destructive ambiguity, unavailable credentials/accounts, or a decision that materially changes product policy.** Ordinary implementation choices should be researched and completed autonomously.

## 25. Recommended commit discipline

Use professional, meaningful commits rather than manufacturing commit count. A good sequence for this remediation might be:
- `test(webauthn): reproduce unauthenticated login and RLS failures`
- `feat(db): add restricted WebAuthn credential routing primitive`
- `test(db): cover WebAuthn routing under forced RLS`
- `feat(auth): persist and atomically consume WebAuthn challenges`
- `feat(auth): complete passkey login session issuance`
- `security(auth): require user verification for passkey login`
- `security(auth): require step-up for passkey lifecycle changes`
- `test(auth): add PostgreSQL passkey login E2E coverage`
- `ci(release): gate publishing on verified candidate SHA`
- `build(supply-chain): pin and attest release dependencies`
- `fix(mobile): surface offline replay rejection and conflicts`
- `docs(status): reconcile canonical production-readiness state`

Exact commits should follow the actual implementation boundaries. Do not split a logically inseparable change just to increase commit count, and do not combine unrelated subsystems in one commit.

## 26. External gates that code alone cannot close

Some production gates require real accounts, credentials, contracts, hardware, or human review. Code should be prepared fully, but completion must not be fabricated when these are unavailable.

Likely external gates include:

- production bank-aggregation approval/credentials and real institution testing;
- production billing account/webhook configuration;
- production domain/DNS/TLS and hosting controls;
- SMTP/email deliverability configuration;
- APNs/FCM push credentials and physical-device verification;
- Apple signing/provisioning/App Store account and device testing;
- Android production signing/store setup as applicable;
- legal terms/privacy review and jurisdiction-specific compliance work;
- independent penetration testing;
- production monitoring/on-call ownership and incident contacts.

For every external gate, leave an exact owner-action checklist and keep the application fail-closed until required secrets/configuration exist.
## 27. Concise risk register

| Risk | Severity | Why it matters | Required disposition |
|---|---|---|---|
| Passkey login routes protected by global auth guard | P0 | Fresh users cannot perform passwordless login | Make only login options/verify public + abuse controls + HTTP tests |
| Credential lookup blocked by forced RLS | P0 | Secure production DB mode can make passkey login fail | Narrow pre-auth DB routing primitive + restricted-role tests |
| Passkey assertion does not issue normal session | P0 | Authentication proof does not establish usable app login | Reuse normal AuthService session/token path |
| Process-local WebAuthn challenges | P0 | Restart/scale-out causes intermittent failures/replay ambiguity | Shared TTL store + atomic consume |
| UV not strongly enforced | P0 | Primary financial login may accept weaker authenticator ceremony | Require/document UV policy + verifier tests |
| No explicit step-up for passkey changes | P0 | Stolen session can become durable account takeover | Recent re-auth + notifications + negative tests |
| Release not structurally CI-gated | P0 | Broken/unverified SHA can be published | Exact-SHA verified release gate |
| Runtime DB owner misuse | P0 | Defeats RLS security model | Hard fail in production; separate migration/admin path |
| Preview deployment mistaken for prod | P1 | Unsafe environment can reach real users | Explicit preview/prod separation and checklist |
| Mutable supply-chain references | P1 | Weaker reproducibility/provenance | SHA/digest pinning, SBOM, signing/attestation |
| Documentation drift | P1 | Agents/maintainers act on false state | Canonical status/handover + archive history |
| Offline replay semantics | P1 | UI/data can diverge after delayed rejection | Pending/rejected/conflict state + idempotency tests |
| Account enumeration surface | P1 | Membership privacy leakage | Product decision + normalized flow if required |
| External compliance/provider gates | P2 | Code can be correct but launch still unsafe/incomplete | Explicit owner actions; never fake completion |

## 28. Immediate next action

The next engineering session should **not add new product features first**. Its first mission is to reproduce and permanently fix the complete passkey authentication chain under the production-style PostgreSQL/RLS model, then prove it with an unauthenticated database-backed end-to-end test.

Once that gate is green, proceed through release integrity, deployment separation, mobile/offline correctness, supply-chain hardening, full regression validation, and only then reconcile production-readiness documentation.

## 29. Final assessment

FINVERSE has a strong enough foundation to justify hardening rather than restarting. The main danger is over-trusting isolated green tests and optimistic documentation. The finance, tenancy, authentication, encryption, and mobile foundations show substantial engineering effort; the remaining high-value work is to make those pieces behave correctly together under the exact secure configuration intended for production.

**Do not call the system production-ready until the P0 gates and production-candidate definition above are objectively satisfied.**
