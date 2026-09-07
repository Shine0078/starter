# FINVERSE Security & Privacy Audit — Track C

Method: static/read-only analysis only. No app/DB/Docker started, no code modified. Repo: `C:\Users\samue\OneDrive\Desktop\starter` (branch `codex/passkey-webauthn-p0`).

## Summary

| Metric | Count |
|---|---|
| PASS | 9 |
| FAIL | 0 |
| PARTIAL (low-severity, by-design) | 1 |
| BLOCKED | 0 |
| Hardcoded secrets found | 0 |
| npm audit vulnerabilities (all severities) | 0 |

### npm audit severity summary (root, npm workspaces covering `apps/api` + `packages/*`, single `package-lock.json`)

| Severity | Count |
|---|---|
| critical | 0 |
| high | 0 |
| moderate | 0 |
| low | 0 |
| info | 0 |
| **total** | **0** |

Dependencies scanned: 191 prod, 150 dev, 66 optional. No apps/api-specific lockfile exists (workspace uses the root lockfile), so a single root `npm audit --json` covers it. No named advisories to report. Full sanitized output saved at `npm-audit-root.json` in this directory (warning banner lines stripped; no secrets present in audit output).

## Findings table

| # | Check | Status | Severity | Evidence (file:line) | Classification |
|---|---|---|---|---|---|
| 1 | Dependency audit | PASS | — | `npm-audit-root.json` (0 vulns, 0 advisories) | — |
| 2 | Secret scan | PASS | — | see below | — |
| 3 | AuthZ / IDOR / tenant isolation | PASS | — | `apps/api/src/modules/auth/auth.guard.ts:24,35-45,73-105`; `apps/api/src/app.module.ts:264`; `apps/api/src/domain/ledger/ledger.service.ts:177-283`; `apps/api/src/infra/postgres/stores.ts:120-631` | — |
| 4 | Row-Level Security | PASS | — | `apps/api/migrations/003_rls.sql:30-81`; `apps/api/src/infra/postgres/pool.ts:127-149`; `apps/api/src/infra/postgres/app-role.ts:69,108` | — |
| 5 | Auth throttling/lockout | PASS | — | `apps/api/src/app.module.ts:225-233,260`; `apps/api/src/modules/auth/auth.controller.ts:35,53,61,79,86,94,102,119,130,138`; `apps/api/src/domain/auth/lockout.ts`; `apps/api/src/infra/auth/mfa-stores.ts:79-81` | — |
| 6 | SSRF & URL validation | PASS | — | `apps/api/src/infra/billing/stripe-provider.ts`; `apps/api/src/infra/banking/plaid-provider.ts:45-46`; `apps/api/src/modules/billing/billing.service.ts:208-236` (all server-config-driven, no client-supplied outbound URL surface) | — |
| 7 | Path traversal & upload validation | PASS (N/A) | — | No file-upload surface exists (no multer/@UploadedFile/createWriteStream) — receipts are pasted-text OCR (`apps/api/src/modules/receipts/receipts.controller.ts:12-18`); CSV export escapes cells + neutralizes formula injection (`apps/api/src/domain/exports/transactions-csv.ts:8-12`); PDF export is in-memory buffer only (`apps/api/src/infra/reports/monthly-report-pdf.ts`) | missing feature (no upload endpoint to exploit) |
| 8 | Webhook signature validation | PASS | — | Stripe: `apps/api/src/infra/billing/stripe-provider.ts:171-179`, `apps/api/src/modules/billing/stripe-webhook.controller.ts:43-61`; Plaid: `apps/api/src/modules/banking/plaid-webhook.controller.ts:17-25`, `apps/api/src/infra/banking/plaid-provider.ts:154-194` (ES256 JWT + timingSafeEqual). Idempotency: `apps/api/src/modules/billing/billing.service.ts:255-259`; `apps/api/src/modules/banking/banking.service.ts:408-413` | — |
| 9 | Sensitive logging | PARTIAL | low | `apps/api/src/infra/auth/auth-action-stores.ts:101` — `DevelopmentEmailSender.sendAction` does `console.log` of the raw verification/reset token | code defect (dev-only convenience code; scoped out of production — see repro) |
| 10 | Account deletion & privacy | PASS | — | `apps/api/src/infra/auth/account-deletion-stores.ts:52-97,103-150`; `apps/api/src/infra/auth/purge-due-accounts.ts`; `apps/api/src/modules/privacy/privacy.service.ts:66-140` (30-day recovery window disclosed at `:111`) | — |

## Detail: Task 1 — Dependency audit

`npm audit --json` at repo root (workspaces: `apps/api`, `packages/*`) → 0 vulnerabilities at every severity. No apps/api-local lockfile to audit separately. **PASS.**

## Detail: Task 2 — Secret scan

- Searched repo (git-tracked scope; `.git`/`node_modules`/build output excluded via `.gitignore`-aware ripgrep) for AWS keys, Stripe live/test key patterns, PEM private-key headers, Slack tokens, and generic `secret|password|token|api_key = "<16+ chars>"` assignments. No hardcoded production secrets found.
- The 11 files matching the generic pattern are all test fixtures (e.g. `apps/api/test/auth-api.spec.ts:1237` — `refreshToken: 'not-a-real-token'`; `apps/api/test/push-delivery.spec.ts:22-24,108` — synthetic RSA keypair generated at test runtime via Node `crypto`, not a committed key).
- `git ls-files` shows only `*.env.example` templates tracked (`apps/api/.env.example`, `infra/.env.oracle.example`, `infra/.env.production.example`, `infra/cloudrun.env.example`) — all contain placeholder tokens (`OWNER_PASSWORD`, `DIRECT_HOST`, commented-out optional vars), no real values.
- The real local `apps/api/.env` (present on disk, 8 vars: `PORT`, `DATABASE_URL`, `DATABASE_APP_URL`, Plaid sandbox vars, `THROTTLE_DISABLED`) is confirmed gitignored: `git check-ignore -v apps/api/.env` → matched by `.gitignore:14:.env`. Not tracked.
- No `.pem`/`.p12`/`.pfx`/`.jks`/`id_rsa`/DB dump files tracked in git.

**PASS.** 0 hardcoded secrets found.

## Detail: Task 9 — Sensitive logging (PARTIAL, low)

`DevelopmentEmailSender.sendAction` (`apps/api/src/infra/auth/auth-action-stores.ts:101`) logs the raw email-verification/password-reset token to stdout via `console.log`. This class is only selected when SMTP is not configured (`apps/api/src/modules/core.module.ts:377-398`), and the same factory throws instead of falling back to `DevelopmentEmailSender` whenever `loadConfig().isProduction` is true and SMTP is incomplete (`core.module.ts:393-396`) — so it cannot be silently active in a production deploy that has `NODE_ENV`/`isProduction` set correctly. Residual risk is scoped to local dev / any non-production environment that both omits SMTP config and has `isProduction` misconfigured to false.

**Repro:** run apps/api with no `SMTP_*` env vars and `isProduction` false, trigger a password-reset or email-verification action, observe the token printed in server stdout.
**Severity:** low (requires misconfiguration; guarded by an explicit production check).
**Classification:** code defect (dev convenience code logging a sensitive value; not exploitable in a correctly configured production deployment).

All other reviewed logger calls (auth, billing, banking, push, crash-reporter) log ids/event types/counts only — no tokens, passwords, or PAN observed in production code paths.

## Notes / limitations

- Review was static only per mission constraints; no runtime fuzzing, no live DB inspection, no dependency-confusion or transitive-supply-chain analysis beyond `npm audit`.
- AuthZ/RLS/throttling/SSRF/upload/webhook/logging/deletion checks were sampled across representative controllers/services/migrations rather than exhaustively every route; no missing-guard or missing-ownership-check instance was found in the sampled set.
