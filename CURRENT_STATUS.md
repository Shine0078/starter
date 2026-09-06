# FINVERSE Current Status

**Verified:** 2026-09-06
**Verified local main:** `2c9bf81`.
**Protected/public deployment:** requires an owner-controlled Cloud Run deploy
and `/api/version` verification before it can be called current.

## Verified Today

- API TypeScript typecheck and production build on local `main`: passed.
- API in-memory suite on local `main`: 67 files passed, 891 tests passed, 9
  tests skipped because they require PostgreSQL.
- API PostgreSQL suite on a fresh embedded cluster: 73 files and 1,076 tests
  passed using the restricted runtime role and forced RLS.
- The fresh PostgreSQL test cluster applied all 43 numbered migrations and
  provisioned `finverse_app`; migration repeat/idempotency is also a blocking
  CI step.
- Production WebAuthn gate passed in that suite: unauthenticated options,
  restricted-role credential routing, assertion verification, normal access and
  refresh issuance, `/auth/me`, replay rejection, eligibility checks, and
  management authorization.
- Flutter analysis on local `main`: passed with no issues.
- Full Flutter test suite: 119 tests passed; Flutter web release build: passed.
- Flutter Android release APK build: passed (`app-release.apk`).
- Manual statement focused tests on local `main`: extraction, summaries,
  encryption, card-payment handling, and authenticated review flow passed.
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
  CI and Container scan workflows for the exact protected-main SHA. API images
  are published with SBOM/provenance attestations and signed by immutable
  digest through keyless Cosign/OIDC. Release run `34013496867` completed for
  `5ebff34`.
- `npm audit --omit=dev` reported zero known production vulnerabilities in the
  recorded audit evidence; rerun it in the release environment before publish.

## Integrated On Main

- Encrypted manual statement import and review workflow.
- Statement import migrations `031`, `032`, `037`, `040`, `041`, `042`, and
  `043`, plus split authorization/consent migrations `033`, `034`, `036`,
  `038`, and `039`.
- First-use account creation from the statement picker.
- Light-only Flutter theme.
- Additional operations, provider, device, incident, and privacy documentation.
- Release identity, supply-chain scanning, signed API image, Android artifact,
  and installable web/PWA artifact gates.

## Not Live In Production Yet

- Local `main` SHA `2c9bf81` has passed all locally feasible API/database/mobile
  gates, but it has not yet been deployed to the canonical Cloud Run service.
- The canonical Cloud Run URL is stale: `/api/version` currently returns 404
  and `/app/` serves an older dark bundle. The local preview at
  `http://localhost:3001/app/` is the only runtime verified in this workstation
  session.
- A repository-wide adversarial security scan is sealed for an earlier protected
  `main`
  with five validated findings (two high, three medium). The report covers
  release identity, backup confidentiality, WebAuthn parser bounds, and split
  authorization/consent. The review
  identified backup confidentiality, deployment image identity, WebAuthn parser
  resource bounds, and shared-expense invitation/consent risks. Actor,
  non-admin write paths, direct split-membership deletes, invitation consent,
  revocation, and balance-checked removal are now hardened on local `main`. The
  sealed report has not been rerun against `2c9bf81`. Backup scripts now fail closed without
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
