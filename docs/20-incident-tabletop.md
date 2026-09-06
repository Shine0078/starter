# Incident tabletop script

Engineering preparation for `Final Goal.md` P2.8. This is a rehearsal script,
not a completed tabletop. The owner still has to name responders and run it.

## Scenario A — stolen database credentials

1. Detection: unexpected Neon login or a burst of RLS denials in logs.
2. Containment: rotate `DATABASE_APP_URL` and `DATABASE_URL`, restart Cloud Run,
   revoke old roles, keep FORCE RLS enabled.
3. Evidence: copy timestamps and role names only. No row payloads.
4. Recovery: deploy the last CI-green SHA. Confirm `/api/readiness` and
   `/api/version`.
5. Users: status-page outage note. No financial details.
6. Follow-up: `docs/18-secret-lifecycle.md` and a restore drill.

## Scenario B — bank-token encryption key suspected leaked

1. Detection: key material in chat, logs, or a stolen env file.
2. Containment: take the API out of service for bank linking. Do not log tokens.
3. Evidence: where the key appeared and who had access.
4. Recovery: dual-key decrypt/re-encrypt migration before discarding the old
   `BANK_TOKEN_ENCRYPTION_KEY`. Rotate Plaid credentials if exposure is confirmed.
5. Users and Plaid: legal/privacy decides notification. Engineering supplies
   timestamps only.
6. Follow-up: secret-manager storage and break-glass review.

## Scenario C — login outage

1. Detection: uptime workflow fails because the probe body lacks
   `"service":"finverse-api"`.
2. Containment: freeze deploys. Check Cloud Run revisions and Neon connectivity.
3. Recovery: roll forward to the last SHA whose CI and `/api/version` match.
4. Users: "Sign-in is unavailable" on the status page. Do not collect new
   registrations while legal URLs are placeholders.

## Scenario D — suspected cross-user access

1. Detection: a user report or an RLS/authorization anomaly.
2. Containment: disable the affected endpoint or revision. Do not weaken RLS.
3. Evidence: request ids, user ids as hashes, and the failing query name.
4. Recovery: patch with a regression test. Re-run `test:db` / RLS suites.
5. Users and counsel: treat as potential confidentiality incident.

## After any rehearsal

Record detection time, containment time, recovery time, gaps, and owners.
Update `docs/15-incident-response.md` if the script was wrong.
