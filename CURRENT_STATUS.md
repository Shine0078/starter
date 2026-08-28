# FINVERSE Current Status

**Verified:** 2026-08-28  
**Integration branch:** `codex/passkey-webauthn-p0` at `c136435`, including the
statement-upload, light-theme, release-identity, parser-bound, split-
  authorization, duplicate-race, supply-chain, and light-only cleanup
  milestones.
**Protected main observed:** `a21b3749164561db75f13f89cd3e9d9f7da07109`.

## Verified Today

- API TypeScript typecheck on `main`: passed.
- API in-memory suite on `main`: 60 files passed, 855 tests passed, 4 files and
  7 tests skipped because they require PostgreSQL.
- API PostgreSQL suite on the integration branch: 71 files and 1,050 tests
  passed using embedded PostgreSQL, a restricted runtime role, and forced RLS.
- Migration verification on a fresh ephemeral PostgreSQL cluster: all 33
  migrations applied, the restricted `finverse_app` role was provisioned, and
  the repeat check reported 0 pending migrations.
- Production WebAuthn gate passed in that suite: unauthenticated options,
  restricted-role credential routing, assertion verification, normal access and
  refresh issuance, `/auth/me`, replay rejection, eligibility checks, and
  management authorization.
- Flutter analysis on the integration branch: passed with no issues.
- Full Flutter test suite: passed; Flutter web release build: passed.
- Flutter Android release APK build: passed (`app-release.apk`).
- Manual statement focused tests on the integration branch: extraction,
  summaries, encryption, and authenticated review flow passed after correcting
  a local generated dependency link.
- Split authorization tests passed under both in-memory and PostgreSQL forced
  RLS: non-admin membership writes and forged payer attribution are rejected.
- Backup scripts now apply owner-only directory/archive permissions and clean up
  temporary plaintext dump files on exit; archive encryption is still an
  external storage/key-management requirement.
- Public and Oracle edge images are pinned to immutable Caddy/Nginx digests;
  the public container scan is blocking and the release gate requires both the
  CI and Container scan workflows for the exact candidate SHA.
- `npm audit --omit=dev` reported zero known production vulnerabilities for both
  current `main` and the integration branch.

## Integrated But Not Yet On Main

- Encrypted manual statement import and review workflow.
- Statement import database migrations `031` and `032`.
- First-use account creation from the statement picker.
- Light-only Flutter theme.
- Additional operations, provider, device, incident, and privacy documentation.

## Not A Production Candidate Yet

- The original `main` worktree has an unresolved, user-owned conflict in
  `infra/scripts/deploy-cloud-run.sh`. It was not discarded or resolved during
  this audit.
- The integration branch is ahead of its remote. Full API PostgreSQL, Flutter,
  and Flutter web regression gates now pass; an Android build and protected-main
  post-merge run remain outstanding.
- A repository-wide adversarial security scan has a validated but unsealed
  five-finding draft for protected `main`. Finalization was rejected by the
  scanner workbench because legacy `includePaths`/`excludePaths` fields were
  supplied; the exact error is retained in the audit log and no seal is
  claimed. Initial review
  identified backup confidentiality, deployment image identity, WebAuthn parser
  resource bounds, and shared-expense invitation/consent risks. Actor and
  non-admin write paths are now hardened on the integration branch; invitation
  acceptance and revocation still need a complete product flow.
- Manual document analysis currently runs in the request lifecycle; durable
  background processing, crash recovery, and production load evidence remain to
  be established.
- Plaid production access, live SMTP delivery, Stripe production configuration,
  domain association, signing, physical-device testing, cloud IAM, encrypted
  off-host backups, and disaster-recovery evidence require owner or external
  infrastructure action.

Do not convert these statements into a completion percentage. A green narrow
test is evidence only for the behavior it actually exercises.
