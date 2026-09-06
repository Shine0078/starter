# Disaster recovery targets

Engineering preparation for `Final Goal.md` P2.3. This is not a completed
production DR exercise. CI already proves a PostgreSQL backup and isolated
restore drill on every change. The owner still has to run that drill against
the live Neon backup store.

## Intended targets

| Metric | Target until a real drill says otherwise |
| --- | --- |
| RPO | 24 hours for the technical beta. Daily encrypted backups. |
| RTO | 4 hours to restore API + Postgres into a new Cloud Run revision and a `_restore_test` database, then promote only after isolation checks. |

These numbers are planning values, not measured production results.

## What CI already proves

- Migrations apply cleanly and are idempotent.
- `infra/scripts/backup-postgres.ps1` produces a non-empty age-encrypted archive.
- `infra/scripts/restore-drill-postgres.ps1` decrypts and restores into an
  isolated database, removing the temporary plaintext dump on exit.
- Production runtime refuses owner/SUPERUSER/BYPASSRLS.

## Live drill still required

1. Take a Neon backup or the age-encrypted archive from the production schedule.
2. Retrieve the recovery identity through the approved two-person process.
3. Restore into a new database whose name ends in `_restore_test`.
4. Verify migration history, RLS isolation, a sample export, and account deletion.
5. Record actual RPO/RTO, gaps, and remediation.
6. Do not overwrite production until two people confirm the restore target.

## Related

- `docs/15-incident-response.md`
- `docs/18-secret-lifecycle.md`
- `.github/workflows/ci.yml` backup/restore job
