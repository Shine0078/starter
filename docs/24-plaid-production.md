# Plaid production checklist

Engineering preparation for `Final Goal.md` P1.5. Sandbox Link is implemented
and fail-closed. This is not production bank access.

## Code already in the repository

- Encrypted Plaid access tokens
- Signed webhook verification
- Restricted-role webhook routing
- MFA step-up for bank linking
- Production refuses `PLAID_ENVIRONMENT=sandbox`

## Owner / Plaid actions

1. Complete Plaid production application for Canada (and US if offered).
2. Store production `PLAID_CLIENT_ID` / `PLAID_SECRET` in the secret manager.
3. Set `PLAID_ENVIRONMENT=production` on Cloud Run only after that.
4. Register webhook and redirect URLs on the canonical Cloud Run origin.
5. For iOS, set `PLAID_IOS_REDIRECT_URI` and `IOS_TEAM_ID` so AASA is served.
6. For Android, complete package allowlist / Digital Asset Links.
7. Test OAuth institutions, update mode, login-required recovery, revoked Items,
   pending-to-posted, and institution downtime on real banks.
8. Do not treat Sandbox categorization quality as production evidence.

## Verification

- `/api/readiness` remains healthy during a sync.
- Failed webhook signatures are rejected and recorded without payloads.
- Removing a bank connection deletes provider tokens and local accounts.
