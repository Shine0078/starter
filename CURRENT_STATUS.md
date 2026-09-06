# FINVERSE Current Status

**Verified:** 2026-09-05
**Integration branch:** `codex/passkey-webauthn-p0` at local candidate SHA
`3057fcf`, including the statement-upload, light-theme, release-identity,
parser-bound, retention/quota, split-authorization, split invitation-consent,
balance-safe member-departure, duplicate-race, supply-chain, encrypted-backup,
and durable-statement-worker milestones. The worktree is clean and is 35
commits ahead of its remote tracking ref.
**Protected main observed:** `a21b3749164561db75f13f89cd3e9d9f7da07109`.

## Verified Today

- API TypeScript typecheck and production build on the integration branch:
  passed.
- API in-memory suite on the integration branch: 66 files passed, 881 tests
  passed, 9 tests skipped because they require PostgreSQL.
- API PostgreSQL suite on a fresh embedded cluster: 72 files and 1,065 tests
  passed using the restricted runtime role and forced RLS.
- The fresh PostgreSQL test cluster applied all 40 numbered migrations and
  provisioned `finverse_app`; migration repeat/idempotency is also a blocking
  CI step.
- Production WebAuthn gate passed in that suite: unauthenticated options,
  restricted-role credential routing, assertion verification, normal access and
  refresh issuance, `/auth/me`, replay rejection, eligibility checks, and
  management authorization.
- Flutter analysis on the integration branch: passed with no issues.
- Full Flutter test suite: 119 tests passed; Flutter web release build: passed.
- Flutter Android release APK build: passed (`app-release.apk`).
- Manual statement focused tests on the integration branch: extraction,
  summaries, encryption, and authenticated review flow passed after correcting
  a local generated dependency link.
- Durable statement queue tests passed under both in-memory and PostgreSQL
  restricted-role paths, including stale-lease recovery and the production
  `202` upload contract.
- Split authorization tests passed under both in-memory and PostgreSQL forced
  RLS: consent is required before membership, invitations can be declined or
  revoked, removal is serialized with financial writes and rejects non-zero
  balances, forged payer attribution is rejected, and direct membership
  deletes remain closed.
- Backup scripts now require authenticated age encryption, apply owner-only
  directory/archive permissions, and clean up temporary plaintext dump files on
  exit; production recipient custody and restore-key controls remain external.
- Public and Oracle edge images are pinned to immutable Caddy/Nginx digests;
  the public container scan is blocking and the release gate requires both the
  CI and Container scan workflows for the exact candidate SHA. API images are
  now published with SBOM/provenance attestations and signed by immutable
  digest through keyless Cosign/OIDC.
- `npm audit --omit=dev` reported zero known production vulnerabilities for both
  current `main` and the integration branch.

## Integrated But Not Yet On Main

- Encrypted manual statement import and review workflow.
- Statement import migrations `031`, `032`, and durable queue migration `037`,
  plus split invitation/consent migration `038` and balance-safe departure
  migration `039`.
- First-use account creation from the statement picker.
- Light-only Flutter theme.
- Additional operations, provider, device, incident, and privacy documentation.

## Not A Production Candidate Yet

- The integration branch is ahead of its remote. Full API PostgreSQL, API
  in-memory, Flutter, Flutter web, and Android regression gates pass locally;
  the protected-main post-merge run and exact-SHA release publication remain
  outstanding.
- The canonical Cloud Run URL is stale: `/api/version` currently returns 404
  and `/app/` serves an older dark bundle. The local candidate preview at
  `http://localhost:3001/app/` is the only runtime verified against SHA
  `3057fcf` in this workstation session.
- A repository-wide adversarial security scan is sealed for protected `main`
  with five validated findings (two high, three medium). The report covers
  release identity, backup confidentiality, WebAuthn parser bounds, and split
  authorization/consent; fixes on the newer integration branch are called out
  separately because the scan target was the protected-main snapshot. The review
  identified backup confidentiality, deployment image identity, WebAuthn parser
  resource bounds, and shared-expense invitation/consent risks. Actor,
  non-admin write paths, direct split-membership deletes, invitation consent,
  revocation, and balance-checked removal are now hardened on the integration
  branch. The sealed report still targets the protected-main snapshot and has
  not been rerun against this branch. Backup scripts now fail closed without
  age encryption, but production key custody is not locally verifiable.
- Manual document analysis now has a durable, forced-RLS queue with stale-lease
  recovery, bounded workers, ZIP expansion limits, source retention expiry, and
  active import quotas. Production OCR/load evidence and external queue/worker
  observability remain to be established.
- Plaid production access, live SMTP delivery, Stripe production configuration,
  domain association, mobile signing, physical-device testing, cloud IAM, encrypted
  off-host backups, and disaster-recovery evidence require owner or external
  infrastructure action.

Do not convert these statements into a completion percentage. A green narrow
test is evidence only for the behavior it actually exercises.
