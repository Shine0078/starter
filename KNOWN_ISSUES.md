# FINVERSE Known Issues

## Release Blockers

- **Unresolved original-worktree conflict:** `main` has a user-owned merge
  conflict in `infra/scripts/deploy-cloud-run.sh`. Preserve it until its intended
  Plaid gate and upstream deployment changes are reconciled deliberately.
- **Integration not merged:** manual statement import and the white default UI
  are on the latest verified state of `codex/passkey-webauthn-p0`, ahead of the
  remote branch.
- **Final candidate regression:** API PostgreSQL (1,062 tests), API in-memory
  (878 tests), Flutter tests (118 tests), Flutter web, and Android release
  builds pass on the integration branch. Migration idempotency and the
  protected-main post-merge run still need the CI environment.
- **Split notifications:** invitation creation, consent, decline, revocation,
  and balance-safe leave/remove are implemented and audited. Push/email
  notification delivery for invitations is not wired yet; users can see
  pending invitations when they open the shared-expenses screen.
- **Security findings on protected main:** the sealed repository-wide audit
  reports five validated findings (two high, three medium). The integration
  branch fixes parser bounds, release image identity, split actor writes, and
  split invitation consent/removal; backup scripts require age encryption.
  The sealed scan has not been rerun on the integration branch, and production
  key custody remains external.
- **Statement processing operations:** Production PDF/OCR/XLSX analysis now uses
  the forced-RLS durable `queued`/`processing` workflow with stale-lease
  recovery and bounded claims. External worker metrics, alerting, and realistic
  OCR/load evidence are still not proven.
- **Image-scan freshness:** Compose and CI now pin the reviewed image versions,
  but digest refreshes remain a deliberate maintenance task when upstream
  security releases arrive.

## External Or Owner Blockers

- Plaid production access and registered webhook/redirect values.
- Production SMTP credentials and live deliverability evidence.
- Stripe production account, products/prices, webhook, and legal decisions.
- Registered domain/TLS and Android/iOS association readback.
- Android/iOS signing custody, App Store/Play approvals, and physical-device
  passkey/provider testing.
- Production Cloud Run/Neon role, IAM, secret-manager, monitoring, and exact-SHA
  readback.
- Production age recipient/private-key custody, key rotation, off-host storage,
  and a recorded restore/disaster-recovery exercise. Local scripts now encrypt
  and restrict permissions, but production operations are not yet verified.
- Independent penetration test and legal/privacy review before real financial
  users are admitted.

## Local Environment Notes

- The secondary worktree shares root `node_modules` through a junction. Nest's
  test package may require a generated local link when dependencies were
  installed from the original workspace. This is a workstation layout issue,
  not a manifest omission.
- In-memory development accounts and sessions disappear when the API restarts.
