# FINVERSE Project Overview

## Purpose

FINVERSE helps an individual understand and manage personal finances. Users can
maintain manual or provider-linked accounts, review transactions, categorize
spending, set budgets and goals, inspect analytics, plan cash flow, reconcile
statements, and export reports. Shared-expense groups are the deliberate
exception to the otherwise individual-user data model.

## Applications

- `apps/api`: NestJS/Express modular monolith and PostgreSQL adapters.
- `apps/mobile`: Flutter client targeting web, Android, and iOS.
- `packages/contracts`: shared TypeScript contract package.

## Major Capabilities

- Password, MFA, session rotation, recovery, account deletion, and passkeys.
- Forced-RLS PostgreSQL persistence with a restricted runtime role.
- Manual accounts, transactions, categorization rules, budgets, goals, and
  scheduled transactions.
- Analytics, financial health, cash-flow forecasts, notifications, and PDF/CSV
  exports.
- Plaid bank aggregation and Stripe billing adapters when owner credentials and
  provider approvals are configured.
- Review-first CSV import plus the feature branch's encrypted manual statement
  workflow for CSV, XLSX, text PDF, and supported images.
- Encrypted, owner-scoped native offline cache and bounded mutation replay.
- Flutter web/PWA, Android, and iOS builds.

## Deliberate Non-Claims

- The application is not a bank, payment rail, tax adviser, or investment
  adviser.
- In-memory development mode is not durable and is never production-safe.
- Preview deployments are not approved to hold real financial data.
- Provider integrations are unavailable until their production credentials and
  account approvals exist.
- Source implementation does not prove live cloud IAM, domain, TLS, backups,
  monitoring, signing custody, or provider dashboard configuration.

