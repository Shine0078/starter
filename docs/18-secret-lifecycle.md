# Production secret lifecycle

Engineering preparation for `Final Goal.md` P2.9. This is not a completed KMS
migration. It records how FINVERSE secrets must be stored, rotated, and
replaced without leaking financial data.

## Inventory

| Secret | Used for | Rotation note |
| --- | --- | --- |
| `GIT_SHA` | Deployment identity | Set to the exact released SHA. Not a credential. |
| `JWT_SECRET` | Access-token signatures | Rotate by dual-publishing for one access-token lifetime, then retire the old value. Existing sessions must re-authenticate after expiry. |
| `MFA_ENCRYPTION_KEY` | TOTP seed encryption | Do not rotate without a decrypt/re-encrypt migration. Losing this key locks out MFA users. |
| `BANK_TOKEN_ENCRYPTION_KEY` | Plaid access-token encryption | Same as MFA: migrate ciphertext before discarding the old key. Never log the key or decrypted tokens. |
| `DATABASE_URL` | Schema-owner / migrations | Privileged. Use only for migrate jobs. Rotate in Neon, then update the private env file. |
| `DATABASE_APP_URL` | Restricted runtime role | Rotate independently from the owner URL. Production must refuse owner/SUPERUSER/BYPASSRLS. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing | Live keys only in production. Rotate webhook secret in Stripe, then update the service before the old secret is disabled. |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Bank aggregation | Production environment only. Rotate in Plaid dashboard; old sandbox values must never reach production. |
| `SMTP_PASSWORD` | Transactional email | Rotate at the provider; keep the from-address unchanged. |
| `FCM_CREDENTIALS_JSON` | Push | Store the full service-account JSON in a secret manager, not a repo file path. |
| `SENTRY_DSN` | Optional crash sink | Public DSN only. Crash text is redacted of tokens, emails, and long numbers. |
| Android upload keystore | Play releases | Keep offline and backed up. Losing it blocks Play updates. |
| Apple signing / APNs | iOS releases and push | Owner Apple account. Not stored in this repository. |

## Rules

1. Never commit secrets, paste them into chat, or print them in logs.
2. Production env files stay mode `600` on the operator machine or in Cloud Secret Manager.
3. Rotate the least-privileged runtime DB password independently from the schema owner.
4. Encrypted-at-rest keys (`MFA_ENCRYPTION_KEY`, `BANK_TOKEN_ENCRYPTION_KEY`) need a dual-key migration. Do not overwrite them in place.
5. After a suspected leak: revoke the secret, rotate dependents, review auth/security events, and follow `docs/15-incident-response.md`.
6. A green uptime check is not proof that secrets are healthy. `/api/version` must match the intended SHA after a rotation deploy.

## Owner actions still required

- Select a production secret manager / KMS.
- Store the current Cloud Run env file there instead of a home-directory YAML.
- Rehearse JWT, DB, and bank-token rotation in staging.
- Record who can break-glass into Neon and Google Cloud.
