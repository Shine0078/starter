# Incident response

This is FINVERSE's minimum launch runbook. It defines the engineering process;
the owner still has to name the people on call, configure contact channels, and
rehearse it before accepting production customers.

## Severity and response targets

| Severity | Examples | Acknowledge | User update |
| --- | --- | ---: | ---: |
| SEV-1 | Suspected data exposure, account takeover, destructive corruption, or the service unavailable for most users | 15 minutes | 30 minutes |
| SEV-2 | Bank sync, authentication, billing, or notifications materially impaired | 30 minutes | 60 minutes |
| SEV-3 | Degraded non-critical feature with a safe workaround | 1 business day | As needed |

Safety and privacy outrank availability. Never weaken authentication, row-level
security, webhook verification, or encryption to restore service faster.

## First responder checklist

1. Open one incident record with start time, severity, owner, and a private event
   timeline. Do not paste access tokens, database URLs, transaction descriptions,
   email addresses, or bank data into tickets or chat.
2. Confirm impact using `/healthz`, protected `/api/metrics`, hosting logs, and the
   provider dashboards. Treat the public uptime alert as a signal, not proof of
   root cause.
3. Contain the incident. Suitable actions include pausing a deploy, disabling a
   compromised provider credential, blocking a malicious source at the edge, or
   temporarily disabling the affected integration. Preserve logs and evidence.
4. If confidentiality may be affected, stop routine debugging exports, restrict
   access to the smallest response group, record every person who accessed data,
   and contact privacy/legal counsel immediately for notification deadlines.
5. Restore through a reviewed forward fix or the last known-good application
   image. Do not run destructive SQL or restore a backup over production without
   a second person verifying the exact target and recovery point.
6. Verify authentication, bank sync, ledger isolation, exports, deletion, billing,
   and notifications as applicable. Monitor the fix before resolving the event.
7. Publish a plain-language resolution update that states impact and duration
   without exposing security details or blaming a user or provider.

## Database recovery

Keep production immutable while testing a backup. Restore first into a new
database whose name ends in `_restore_test`:

```powershell
./infra/scripts/restore-drill-postgres.ps1 `
  -Archive <encrypted-backup-after-approved-decryption> `
  -RestoreDatabaseUrl <isolated-restore-test-url>
```

Validate migration history, tenant isolation, row counts, and a representative
export. Record the recovery point objective achieved and elapsed recovery time.
Promotion of restored data into production needs two-person approval and a
provider-specific change plan.

## Communications

- Use the public status page for availability and broad feature impact.
- Contact affected users directly only through an approved support/email system.
- Legal counsel decides regulatory and breach notifications; engineering supplies
  verified facts and timestamps but does not make the legal determination.
- Never include personal financial details in a public status update.

## After the incident

Within five business days, document contributing conditions, detection gaps,
timeline, impact, recovery evidence, and corrective actions with owners and due
dates. Prefer systemic fixes and tests over individual blame. Review key rotation,
backup integrity, monitoring thresholds, and whether the runbook itself failed.

## Required rehearsal before launch

- Assign a primary and backup responder and a privacy/legal contact.
- Configure repository variable `PRODUCTION_HEALTH_URL` to the public HTTPS
  `/healthz` URL and enable GitHub issue notifications for responders.
- Run a restore drill from the actual encrypted backup store.
- Simulate an API outage and confirm detection, acknowledgement, user messaging,
  recovery, and issue resolution.
- Create an independently hosted public status page; the API cannot report its
  own outage when the API or its hosting provider is unavailable.
