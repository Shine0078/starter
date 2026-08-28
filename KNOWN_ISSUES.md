# FINVERSE Known Issues

## Release Blockers

- **Unresolved original-worktree conflict:** `main` has a user-owned merge
  conflict in `infra/scripts/deploy-cloud-run.sh`. Preserve it until its intended
  Plaid gate and upstream deployment changes are reconciled deliberately.
- **Integration not merged:** manual statement import and the white default UI
  are on `codex/passkey-webauthn-p0`, ahead of the remote branch.
- **Full post-merge regression pending:** run API PostgreSQL tests, migration
  idempotency, Flutter tests, web build, and Android build on the final candidate.
- **Security review open:** split-group invitations still add an existing
  account immediately and have no accept/decline/revoke lifecycle. The API now
  limits additions to admins, returns a generic account error, and binds payer
  attribution to the authenticated actor, but target consent and membership
  removal still require a complete invitation flow.
- **Statement processing durability:** PDF/OCR/XLSX analysis is bounded but runs
  in the request lifecycle. A durable, observable background job model with
  restart recovery and concurrency limits is not yet proven.

## External Or Owner Blockers

- Plaid production access and registered webhook/redirect values.
- Production SMTP credentials and live deliverability evidence.
- Stripe production account, products/prices, webhook, and legal decisions.
- Registered domain/TLS and Android/iOS association readback.
- Android/iOS signing custody, App Store/Play approvals, and physical-device
  passkey/provider testing.
- Production Cloud Run/Neon role, IAM, secret-manager, monitoring, and exact-SHA
  readback.
- Authenticated encryption for off-host backups, key rotation, and a recorded
  restore/disaster-recovery exercise. Local scripts now restrict permissions,
  but compression alone is not encryption.
- Independent penetration test and legal/privacy review before real financial
  users are admitted.

## Local Environment Notes

- The secondary worktree shares root `node_modules` through a junction. Nest's
  test package may require a generated local link when dependencies were
  installed from the original workspace. This is a workstation layout issue,
  not a manifest omission.
- In-memory development accounts and sessions disappear when the API restarts.
