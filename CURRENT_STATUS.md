# FINVERSE Current Status

**Verified:** 2026-08-28  
**Integration branch:** `codex/passkey-webauthn-p0` at merge commit `688a39d`
plus the statement-upload and light-theme commits below it.  
**Protected main observed:** `a21b3749164561db75f13f89cd3e9d9f7da07109`.

## Verified Today

- API TypeScript typecheck on `main`: passed.
- API in-memory suite on `main`: 60 files passed, 855 tests passed, 4 files and
  7 tests skipped because they require PostgreSQL.
- API PostgreSQL suite on `main`: 64 files and 1,021 tests passed using embedded
  PostgreSQL, a restricted runtime role, and forced RLS.
- Production WebAuthn gate passed in that suite: unauthenticated options,
  restricted-role credential routing, assertion verification, normal access and
  refresh issuance, `/auth/me`, replay rejection, eligibility checks, and
  management authorization.
- Flutter analysis on the integration branch: passed with no issues.
- Manual statement focused tests on the integration branch: extraction,
  summaries, encryption, and authenticated review flow passed after correcting
  a local generated dependency link.
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
- The integration branch is ahead of its remote and has not passed a fresh full
  PostgreSQL, Flutter, web, and Android regression run after its latest merge.
- A repository-wide adversarial security scan is in progress. Initial review
  identified shared-expense invitation and actor-authority questions requiring
  validation and remediation decisions.
- Manual document analysis currently runs in the request lifecycle; durable
  background processing, crash recovery, and production load evidence remain to
  be established.
- Plaid production access, live SMTP delivery, Stripe production configuration,
  domain association, signing, physical-device testing, cloud IAM, encrypted
  off-host backups, and disaster-recovery evidence require owner or external
  infrastructure action.

Do not convert these statements into a completion percentage. A green narrow
test is evidence only for the behavior it actually exercises.

