# FINVERSE API / Domain / PostgreSQL Verification

Date: 2026-08-21  
Scope: `apps/api`, domain rules, persistence, migration behavior, and local API execution. Flutter and deployment infrastructure were not modified.

## Architecture read before testing

The API follows the accepted ADRs:

- ADR-0001: one NestJS modular monolith; no microservices or broker is required at this stage.
- ADR-0002: pure domain functions under `apps/api/src/domain`, with ports and in-memory/Postgres adapters.
- ADR-0003: money is integer minor units, paired with an ISO currency; mismatched currencies throw.
- ADR-0004: deterministic user rules, lexicon, and bounded personal learning precede any model; unknown is an honest fallback.
- ADR-0005: server-readable financial facts support computation; link tokens and user free text have stronger protection.
- ADR-0006: PostgreSQL RLS is forced on user-owned data and requests use a non-superuser runtime role with transaction-local user scope.
- ADR-0007: hosted billing, derived entitlements, and fail-closed webhook handling.

FINVERSE is **not an Electron target**. The repository contains a NestJS API plus a Flutter Android/iOS client and an optional Flutter web/PWA bundle served by the API (`/app/`).

## Commands and results

All database work used `embedded-postgres` on localhost with throwaway OS temp directories. No production URL, credential, or database was used.

| Command | Result | Evidence |
|---|---|---|
| `git status --short --branch` | PASS | Expected branch `codex/passkey-webauthn-p0`; no source changes. Existing untracked `output/FINVERSE-HARNESS-EVIDENCE/` from another track was preserved. |
| `npm ci` | PASS | 298 packages installed/audited; 0 vulnerabilities. |
| `npm run typecheck` | **FAIL (tooling)** | Root `package.json` has no `typecheck` script (`npm error Missing script: "typecheck"`). |
| `npm run typecheck --workspace @finverse/api` | PASS | `tsc --noEmit` completed cleanly. |
| `npm run test` | PASS | 61 files passed; 858 tests passed; 7 intentionally DB-gated tests skipped. |
| `npm run test:db` | PASS | Fresh embedded PostgreSQL; 65 files passed; 1,024 tests passed; no skips. Includes RLS, migration-backed store contracts, deletion purge, imports, splits, reconciliation, throttling, and WebAuthn PostgreSQL suites. |
| `npm run build` | PASS | `tsc -p tsconfig.build.json` completed cleanly. |
| `npm run demo` | PASS | In-memory vertical slice completed: 211 transactions/3 accounts, 92.9% categorization coverage, budgets, insights, subscriptions, alerts, and health score output. |
| `npm run migrate:verify` | **FAIL (tooling)** | Root script is absent (`npm error Missing script: "migrate:verify"`). |
| `npm run migrate:verify` in a fresh database | EXPECTED FAIL | Workspace check correctly reported 30 pending migrations before migration. |
| `npm run migrate` then `npm run migrate:verify` in the same temp database | PASS | All migrations `001`–`030` applied; runtime role provisioned; verify reported `Applied migrations: 30`, `Pending migrations: 0`. |
| `npm run load:smoke` | PASS | In-memory: 250 requests, concurrency 10, failures 0, p95 30.4 ms (750 ms threshold). |
| Postgres load smoke after migration/provisioning | PASS | 250 requests, concurrency 10, failures 0, throughput 188.7 req/s, p50 35.1 ms, p95 141.8 ms, p99 373 ms, max 434.1 ms. |
| API dev boot + `GET http://127.0.0.1:3311/healthz` | PASS | HTTP 200: `{"status":"ok","service":"finverse-api","store":"memory","environment":"development"}`. Process stopped and port released. |

### Database setup

`apps/api/scripts/with-postgres.ts` started official PostgreSQL binaries on random localhost ports (examples: 54839, 58926, 59992, 62745). Each non-`--serve` invocation used a fresh `finverse-pg-*` temp directory and removed it after the child process exited. The owner connection ran migrations; the app role was provisioned as `finverse_app` with local test-only credentials, and the runtime pool used that role for RLS tests. Docker was not required and no persistent cluster was left running.

## Data-integrity and behavior findings

| Area | Result / coverage |
|---|---|
| Money representation | PASS. Domain rejects fractional minor units; Postgres monetary columns are `bigint`; node-postgres INT8 parser returns numbers; add/subtract/sum are exact and sign-safe. |
| Currency and rounding | PASS. Currency mismatch throws; JPY/KRW/VND/CLP/ISK zero-decimal and BHD/KWD/OMR/TND three-decimal exponents are tested; major-to-minor rounds symmetrically half-away-from-zero; split allocation reconciles remainder exactly. |
| Dates/time zones | PASS. Postgres `date` parser preserves `YYYY-MM-DD`; UTC range helpers cover DST, month-end clamping, leap years, inclusive ranges, and like-for-like month-to-date comparisons. |
| Account CRUD | PASS within supported semantics. Manual accounts support create/update/delete; provider accounts are sync-owned and cannot be edited through manual endpoints. Account ownership and credit-card validation are covered. |
| Transaction CRUD | PASS within supported semantics. Provider rows are inserted/upserted by sync, queried/filtered, recategorized, annotated, tagged, and safely removed by provider/import operations. Arbitrary client mutation/deletion of provider evidence is intentionally not exposed. |
| Transfers/reconciliation | PASS. Internal transfers pair only compatible same-currency rows, avoid pending/self/double pairing, and reconciliation handles date cutoffs, card signs, currency mismatch, archived assertions, and exact differences. |
| CSV import/duplicates | PASS. Delimiters, BOM/CRLF/quoted fields, date ambiguity, debit/credit directions, malformed rows, duplicate rows, and import revert/idempotency are covered; invalid rows are reported rather than dropped. |
| Categorization/splits | PASS. Rule precedence, normalization, confidence floor, conflict abstention, explainability, exact split remainder math, membership authorization, and Postgres member RLS all pass. |
| Budgets/goals | PASS. Currency-scoped spend, transfers/refunds/pending exclusion, threshold and pace alerts, period clamping, goal contribution totals, completion caps, and projection evidence pass. |
| Subscriptions/alerts | PASS. Recurrence requires evidence, separates currencies, handles price rises and short months, excludes transfers/inflows, and produces deduplicated evidence-backed alerts respecting preferences. |
| Insights/forecasts | PASS. Income/expense separation, currency isolation, refund matching, velocity, savings rate, health score, repeatable-income forecast, purchase scenarios, and credit-card payment plans pass. |
| Idempotency/retry | PASS. Sync upserts on `(user, account, provider_txn_id)` without undoing user corrections; import/revert and rule-application undo are transactional/idempotent; refresh-token rotation permits only one concurrent spender; webhook retry paths are covered. |
| Authorization boundaries | PASS. Global bearer guard, malformed/tampered token rejection, ignored legacy user header, per-user stores, cross-user API attempts, and direct unfiltered SQL under RLS are covered. |
| Account deletion/purge | PASS. Explicit confirmation/password (and MFA where enabled), immediate access disablement, bank-link revocation gate, recovery window, and owner-verified purge of identity/session/audit/financial rows pass. |
| PostgreSQL migrations/RLS | PASS. 30 migrations apply transactionally and verify clean. Runtime role is non-superuser/non-BYPASSRLS; tables are forced RLS; cross-user SELECT/INSERT/UPDATE/DELETE and scope leakage tests pass. |
| Concurrent requests/transaction integrity | PASS. Memory and Postgres load smoke each run 250 requests at concurrency 10 with zero failures and p95 below threshold. Store tests verify atomic import/rule/deletion transactions; concurrent refresh-token spending is explicitly tested. |

## Defects and recommendations

### DEF-API-001 — Missing root `typecheck` script (Low, P2 tooling)

**Reproduction**

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter
npm run typecheck
```

Actual: `npm error Missing script: "typecheck"`. The API workspace command succeeds:

```powershell
npm run typecheck --workspace @finverse/api
```

**Impact:** CI/contributor instructions that use the requested root command fail before TypeScript is checked.  
**Recommended fix:** add a root alias, e.g. `"typecheck": "npm run typecheck --workspace @finverse/api"`, or document the workspace-qualified command consistently.

### DEF-API-002 — Missing root `migrate:verify` script (Low, P2 tooling)

**Reproduction**

```powershell
npm run migrate:verify
```

Actual: `npm error Missing script: "migrate:verify"`. The workspace script works after migrations have run:

```powershell
npm run migrate --workspace @finverse/api
npm run migrate:verify --workspace @finverse/api
```

**Impact:** the requested root verification command cannot be run, making a clean-schema check easy to omit.  
**Recommended fix:** add a root alias to `npm run migrate:verify --workspace @finverse/api` and keep the explicit “pending migrations” failure on an uninitialized database.

### DEF-API-003 — Direct Postgres load-smoke invocation requires a prior migration (Low, P2 test harness ergonomics)

**Reproduction**

```powershell
npx ts-node apps/api/scripts/with-postgres.ts powershell.exe -NoProfile -Command \
  "`$env:LOAD_TEST_DATABASE='true'; npm.cmd run load:smoke --workspace @finverse/api"
```

Actual: the app selected Postgres but failed with `28P01 password authentication failed for user "finverse_app"`, because `load-smoke.ts` bootstraps `AppModule` directly and does not run `main.ts` migration/role provisioning. This is a fresh-database setup failure, not a production data leak.  
**Validated workaround:** run `npm run migrate --workspace @finverse/api` first in the same temporary database, then run load smoke; the Postgres run passed (250/250, p95 141.8 ms).  
**Recommended fix:** have the DB load-smoke wrapper run migrations/provisioning before starting the test app, or add a preflight error explaining the required setup. Keep the existing local/remote safety guards.

No financial arithmetic, authorization, RLS, migration, or transaction-integrity defect was observed in the requested local verification. No API source or test files were changed.

## Exact reproduction summary

1. `npm ci`.
2. Run `npm run typecheck --workspace @finverse/api`, `npm run test`, and `npm run build`.
3. Run `npm run test:db`; it creates and destroys an embedded PostgreSQL cluster and executes 1,024 DB-backed tests.
4. For migration verification, run `npm run migrate` and then `npm run migrate:verify` in one `with-postgres.ts` invocation so both see the same ephemeral cluster; expect 30 applied and 0 pending.
5. Run `npm run demo` for the deterministic in-memory vertical slice.
6. Run `npm run load:smoke` for memory, or migrate first and set `LOAD_TEST_DATABASE=true` for the disposable Postgres load smoke.

