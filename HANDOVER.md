# FINVERSE — CONTINUE PROJECT FROM CURRENT HANDOFF TO PRODUCTION-READY STATE

You are taking ownership of an existing financial-management application called **FINVERSE**.

Another agent, **ChatGPT Terra 5.6**, completed a significant portion of the project. The status report below is a **handoff, not guaranteed truth**.

Your job is to:

**Inspect the entire real repository, independently verify the current implementation, identify what is actually complete/incomplete, and then continue engineering the project until every task that can reasonably be completed in this environment is finished, tested, integrated, and documented.**

Do not simply repeat the handoff or create another roadmap.

**Execute the work.**

---

# 1. PRIMARY OBJECTIVE

Transform FINVERSE from its current development-stage implementation into a secure, scalable, polished, production-oriented personal financial management platform.

The finished system should eventually allow users to:

* securely create accounts and authenticate;
* connect financial institutions;
* automatically import transactions;
* intelligently categorize spending;
* correct categories and learn from corrections;
* create budgets;
* monitor subscriptions;
* detect subscription price increases;
* track income, spending, savings, debt, and cash flow;
* receive useful financial alerts;
* manage credit-card utilization and payments;
* create savings goals;
* forecast future cash flow;
* simulate major purchases;
* detect suspicious or abnormal transactions;
* receive monthly financial reports;
* export their financial information;
* manage privacy, consent, retention, and deletion;
* safely use the app offline;
* understand their finances through a clean mobile-first UX.

The application must prioritize:

**Security → Privacy → Financial correctness → Reliability → UX → Performance → Scalability → Maintainability.**

Never sacrifice financial correctness or security merely to finish a feature faster.

---

# 2. FIRST ACTION — AUDIT THE REAL PROJECT

Before editing code, inspect the entire repository:

`C:\Users\samue\OneDrive\Desktop\starter`

At minimum inspect:

* repository structure;
* `MISSION.md`;
* architecture documentation;
* roadmap;
* security/privacy documentation;
* launch documentation;
* API;
* Flutter app;
* database layer;
* migrations;
* tests;
* CI configuration;
* environment/configuration files;
* scripts;
* generated files;
* Git state;
* TODO/FIXME markers;
* mocks and temporary implementations;
* authentication assumptions;
* persistence boundaries;
* mobile architecture;
* API contracts.

Important files/directories include:

* `MISSION.md`
* `docs/01-architecture.md`
* `docs/03-security-privacy.md`
* `docs/04-roadmap.md`
* `docs/06-cheap-launch-path.md`
* `apps/api`
* `apps/mobile`
* `.github/workflows/ci.yml`

Run:

* Git status
* build/typecheck
* tests
* database-backed tests where possible
* Flutter analyze
* Flutter tests
* API tests
* relevant security/static checks

Do **not** assume Terra's status report is completely accurate.

Create your own verified understanding from the repository.

If documentation disagrees with the implementation, **the implementation is the current source of truth**, and the documentation should eventually be corrected.

---

# 3. CRITICAL REPOSITORY SAFETY RULE

There are many existing uncommitted changes.

**DO NOT:**

* `git reset --hard`
* discard the working tree;
* delete unknown work;
* overwrite working features;
* blindly revert files;
* clean untracked files without inspecting them;
* rewrite functioning architecture unnecessarily.

Preserve existing work.

Before modifying important systems, understand why they exist.

Make incremental, controlled changes.

---

# 4. VERIFIED HANDOFF FROM PREVIOUS AGENT

Terra reported the following as currently working:

## Backend

* NestJS API
* mock financial data
* optional PostgreSQL persistence

## Mobile

* Flutter Android application
* dashboard runs on Android emulator

Reported APK:

`C:\Users\samue\OneDrive\Desktop\starter\apps\mobile\build\app\outputs\flutter-apk\app-debug.apk`

## Reported implemented features

* transaction synchronization;
* transaction categorization;
* category correction rules;
* budgets;
* budget threshold alerts;
* subscription detection;
* subscription price-increase detection;
* financial health score;
* cash-flow forecast;
* charts;
* credit-card utilization planning;
* credit-card payment planning;
* CSV transaction export;
* spreadsheet-formula injection protection;
* one-off purchase simulator;
* development dashboard.

## Reported test state

* approximately 162 tests without DB;
* approximately 189 tests with PostgreSQL;
* API build passes;
* API typecheck passes.

Verify all of these claims yourself.

---

# 5. EXECUTION PRINCIPLE

After the audit, immediately start implementation.

Do not stop after finishing one task.

Use this cycle continuously:

**Inspect → Design → Implement → Test → Fix → Integrate → Document → Continue**

When one task reaches a reliable state, automatically move to the next highest-value task.

Do not wait for permission between normal engineering stages.

Only stop when:

1. everything feasible in this environment has been completed; or
2. progress is blocked by something genuinely requiring owner credentials, commercial agreements, external hardware/accounts, or another unavailable dependency.

When blocked externally, clearly isolate the dependency and continue everything else that does **not** require it.

---

# 6. PRIORITY 1 — REAL AUTHENTICATION AND USER ISOLATION

The existing `x-user-id` / demo-user mechanism is development-only.

Replace it with a real authentication architecture.

Implement appropriately:

* user registration;
* login;
* logout;
* secure password hashing if passwords are supported;
* refresh/session strategy;
* session revocation;
* device/session management;
* authorization guards;
* protected API routes;
* per-user ownership checks;
* account recovery architecture;
* email-verification architecture;
* OAuth 2.0 / OpenID Connect readiness;
* Authorization Code + PKCE for mobile OAuth;
* passkey/WebAuthn architecture where practical;
* MFA/TOTP readiness;
* rate limiting;
* brute-force protection;
* secure token handling;
* secure cookie settings where applicable;
* CSRF protection where relevant;
* appropriate expiration policies.

Remove reliance on arbitrary client-provided user IDs.

Never allow one authenticated user to access another user's records.

Add automated tests proving user isolation.

---

# 7. PRIORITY 2 — DATABASE MULTI-USER SECURITY

Strengthen PostgreSQL for production.

Implement or prepare:

* proper user ownership columns;
* foreign-key integrity;
* uniqueness constraints;
* safe indexes;
* migration discipline;
* timestamps;
* soft-delete only where justified;
* account deletion behavior;
* transaction boundaries;
* duplicate protection;
* idempotency where appropriate;
* row-level security;
* RLS policies;
* migration tests;
* rollback considerations.

The system must not rely solely on application code for multi-user data isolation.

Add tests attempting cross-user access.

They must fail securely.

---

# 8. PRIORITY 3 — BANK AGGREGATION ARCHITECTURE

The current aggregator is reportedly mock-only.

Build a clean provider-neutral architecture.

Create interfaces/adapters capable of supporting providers such as:

* Plaid;
* Flinks;
* supported Open Banking providers.

Do **not** fabricate live credentials or pretend integrations are operational without them.

Implement everything possible without credentials:

* provider abstraction;
* sandbox/mock provider;
* account-linking state machine;
* Link-token creation abstraction;
* secure access-token storage architecture;
* encryption-at-rest mechanism;
* sync cursor persistence;
* incremental transaction synchronization;
* idempotent imports;
* webhook models;
* webhook signature validation abstraction;
* retry behavior;
* duplicate webhook handling;
* pending → posted reconciliation;
* changed transaction handling;
* removed transaction handling;
* disconnected institution handling;
* re-authentication flow;
* account reconnection;
* institution status handling;
* provider error normalization;
* audit logging;
* tests.

External credentials should later plug into the architecture without major refactoring.

---

# 9. PRIORITY 4 — PRIVACY AND DATA OWNERSHIP

FINVERSE handles extremely sensitive financial information.

Build proper user privacy controls.

Implement:

* privacy dashboard;
* consent records;
* consent timestamps/versioning;
* connected-data permissions;
* analytics preferences;
* marketing preference separation;
* notification preferences;
* user-data export;
* full account deletion;
* deletion workflow/status;
* retention-policy enforcement;
* audit trail;
* security-event history;
* connected-bank revocation workflow;
* data minimization;
* sensitive field encryption;
* encryption-key abstraction;
* key rotation support;
* secrets separation;
* redaction in application logs.

A user should be able to understand:

**what FINVERSE stores, why it stores it, where it came from, and how to remove it.**

Never claim:

* zero knowledge;
* end-to-end encryption;
* bank-grade security;
* regulatory compliance;

unless the implementation genuinely supports the claim.

---

# 10. PRIORITY 5 — COMPLETE THE FLUTTER PRODUCT EXPERIENCE

The current app reportedly contains mainly a dashboard.

Turn it into a coherent mobile application.

Implement a professional navigation structure and screens for:

### Dashboard

* account overview;
* income;
* spending;
* savings;
* budget progress;
* upcoming bills;
* recent activity;
* financial health;
* cash-flow outlook.

### Transactions

* transaction list;
* search;
* filters;
* date filters;
* merchant filters;
* category filters;
* transaction detail;
* category correction;
* notes/tags if architecture supports them;
* pending status;
* recurring indicator.

### Budgets

* create/edit/delete;
* category budgets;
* monthly limits;
* progress;
* threshold warnings;
* over-budget state;
* historical comparison.

### Subscriptions

* detected recurring charges;
* frequency;
* next estimated payment;
* annualized cost;
* price-change detection;
* subscription cancellation guidance where appropriate.

### Cash Flow

* forecast chart;
* projected balance;
* income assumptions;
* upcoming commitments;
* low-balance risk.

### Purchase Simulator

* hypothetical purchase amount;
* projected effect on cash;
* budget;
* savings;
* credit-card utilization;
* short-term forecast.

### Credit Cards

* balances;
* limits;
* utilization;
* statement/payment information where available;
* recommended payment amount;
* risk indicators.

### Goals

* savings goals;
* target amount;
* target date;
* contribution plan;
* progress;
* emergency fund.

### Reports

* monthly reports;
* historical reports;
* export.

### Settings

* profile;
* security;
* devices/sessions;
* notifications;
* connected institutions;
* privacy;
* data export;
* account deletion.

Make the UI:

* clean;
* modern;
* responsive;
* accessible;
* consistent;
* understandable to non-financial users.

Avoid information overload.

---

# 11. PRIORITY 6 — OFFLINE-FIRST MOBILE ARCHITECTURE

Build useful offline operation.

Implement where appropriate:

* encrypted local persistence;
* cached dashboard data;
* cached transactions;
* offline read access;
* mutation queue;
* retry queue;
* sync status;
* connectivity awareness;
* optimistic updates where safe;
* conflict-resolution strategy;
* server-authoritative financial balances;
* sync timestamps;
* stale-data indication;
* secure logout cleanup;
* biometric/PIN application lock;
* secure credential/token storage.

Never silently overwrite conflicting financial data.

---

# 12. PRIORITY 7 — GOALS AND SAVINGS ENGINE

Create persistent financial goals.

Support:

* emergency funds;
* general savings;
* travel;
* vehicle;
* home;
* education;
* debt payoff;
* custom goals.

Each goal may contain:

* target value;
* current value;
* target date;
* priority;
* contribution schedule;
* recommended contribution;
* linked account if supported;
* progress history.

Create useful suggestions such as:

* required weekly contribution;
* required monthly contribution;
* estimated completion date;
* effect of increasing contribution;
* impact of planned purchases.

Keep recommendations explainable.

---

# 13. PRIORITY 8 — REPORTING ENGINE

Build a monthly reporting system.

Report useful metrics such as:

* total income;
* total expenses;
* savings;
* savings rate;
* spending by category;
* budget performance;
* subscriptions;
* recurring bills;
* debt;
* credit utilization;
* largest transactions;
* month-over-month differences;
* financial health score;
* goal progress;
* forecast;
* notable anomalies.

Support:

* in-app report;
* PDF generation;
* user-triggered generation;
* scheduled monthly generation architecture;
* report history;
* CSV/data export.

Reports should explain insights in plain language.

Avoid pretending that generated observations are professional financial advice.

---

# 14. PRIORITY 9 — NOTIFICATION ENGINE

Create configurable notification infrastructure for:

* budget thresholds;
* overspending;
* unusual transactions;
* duplicate charges;
* subscription renewals;
* subscription price increases;
* bills;
* credit-card utilization;
* upcoming credit-card payment;
* low predicted balance;
* goal progress;
* successful institution synchronization;
* bank connection failures;
* re-authentication requirements;
* security events.

Support:

* in-app notifications;
* local notifications;
* push-notification abstraction.

Prevent spam.

Allow users to configure categories and thresholds.

---

# 15. PRIORITY 10 — FRAUD / ANOMALY SIGNALS

Implement explainable anomaly detection.

Examples:

* duplicate charges;
* unusually large transaction;
* unusual merchant;
* sudden spending spike;
* unusual location/foreign purchase when information exists;
* abnormal transaction frequency;
* unexpected recurring charge;
* subscription price increase.

Start with deterministic/statistical explainable detection.

Do not introduce unnecessary AI complexity before reliable rules and baselines exist.

Every alert should explain **why** it was generated.

Example:

> “This transaction is 4.2× larger than your typical purchase in this category.”

Avoid declaring a transaction definitively fraudulent.

Use language such as:

**“This transaction looks unusual. Please review it.”**

---

# 16. FINANCIAL INTELLIGENCE IMPROVEMENTS

Improve useful analytics where data supports it.

Consider:

* monthly spending baseline;
* spending velocity;
* discretionary vs essential expenses;
* recurring expense ratio;
* fixed vs variable expenses;
* savings rate;
* debt-to-income indicators where data exists;
* cash-buffer days;
* emergency-fund coverage;
* category trends;
* merchant trends;
* lifestyle inflation;
* bill forecasting;
* subscription burden;
* projected end-of-month balance.

Keep calculations deterministic and unit tested.

Document formulas.

---

# 17. CREDIT CARD SAFETY ENGINE

Strengthen the existing credit-card functionality.

Support concepts such as:

* current utilization;
* per-card utilization;
* overall utilization;
* statement balance;
* due date;
* recommended payment;
* projected utilization;
* payment reminders.

Avoid presenting arbitrary utilization percentages as universal laws.

Instead explain them as configurable indicators or general informational guidance.

Do not present the feature as credit or financial advice.

---

# 18. SECURITY HARDENING

Complete production-oriented hardening.

At minimum review and improve:

* production CORS allowlist;
* HTTP security headers;
* DTO validation;
* payload limits;
* malformed-input handling;
* authorization;
* rate limiting;
* brute-force prevention;
* API abuse protection;
* secrets handling;
* SQL injection defenses;
* XSS where applicable;
* CSV injection;
* SSRF risk;
* webhook verification;
* sensitive-log redaction;
* stack-trace leakage;
* dependency vulnerabilities;
* static analysis;
* SAST;
* secret scanning;
* dependency scanning;
* mobile storage;
* certificate/network security;
* build configuration.

Create/update a threat model covering:

* account takeover;
* session theft;
* malicious mobile device;
* compromised bank token;
* cross-user access;
* database leak;
* malicious webhook;
* credential stuffing;
* internal privilege abuse;
* lost/stolen phone;
* supply-chain compromise.

---

# 19. OBSERVABILITY AND OPERATIONS

Implement production foundations:

* structured logs;
* request IDs / correlation IDs;
* security-event logging;
* metrics;
* health endpoint;
* readiness endpoint;
* database health;
* provider health;
* error-monitoring abstraction;
* performance metrics;
* alerting architecture.

Do not log:

* passwords;
* full access tokens;
* refresh tokens;
* bank credentials;
* sensitive PII unnecessarily.

---

# 20. DATABASE OPERATIONS

Prepare for managed PostgreSQL production deployment.

Implement/document:

* migrations;
* migration deployment procedure;
* indexes;
* connection pooling;
* backups;
* restore procedure;
* disaster-recovery expectations;
* retention;
* encryption expectations;
* secret management;
* KMS abstraction;
* key rotation strategy.

Local development currently has successfully used PostgreSQL on:

`localhost:55432`

Docker Desktop may be unreliable on this machine.

Do not make Docker a mandatory requirement if a stable local alternative exists.

---

# 21. CI/CD

Audit:

`.github/workflows/ci.yml`

Expand CI where useful to include:

* install;
* formatting;
* lint;
* typecheck;
* API unit tests;
* database/integration tests;
* Flutter analyze;
* Flutter tests;
* builds;
* migration checks;
* secret scanning;
* dependency scanning;
* security checks.

Keep CI deterministic.

Do not require unavailable commercial secrets for normal pull-request validation.

---

# 22. TESTING REQUIREMENTS

Every major feature should receive appropriate tests.

Use a combination of:

* unit tests;
* service tests;
* repository/database tests;
* integration tests;
* API tests;
* security tests;
* Flutter widget tests;
* regression tests.

Prioritize tests for:

* authentication;
* authorization;
* user isolation;
* bank synchronization;
* pending→posted transaction handling;
* duplicate detection;
* webhook idempotency;
* budgets;
* categorization;
* subscription detection;
* calculations;
* credit-card calculations;
* goals;
* reports;
* deletion/export;
* privacy enforcement.

Never leave the repository knowingly failing.

After every major change:

**run relevant tests immediately and fix failures before proceeding.**

At meaningful milestones, run the full feasible test suite.

---

# 23. MOBILE QUALITY

Use the available environment:

Flutter:

`C:\Users\samue\development\flutter`

Android SDK:

`C:\Users\samue\AppData\Local\Android\Sdk`

Java:

`C:\Program Files\Android\openjdk\jdk-21.0.8`

Android emulator:

`finverse_pixel`

Run the application periodically, not merely static analysis.

Inspect:

* navigation;
* loading states;
* empty states;
* failure states;
* forms;
* long lists;
* small screens;
* theme consistency;
* crashes;
* network failures.

The Android 36 emulator previously produced a temporary:

`System UI isn't responding`

dialog during first boot.

Do not automatically assume this represents a FINVERSE application defect.

---

# 24. ARCHITECTURE STANDARD

Prefer clean boundaries such as:

**Presentation → Application → Domain → Infrastructure**

Avoid:

* giant services;
* duplicated business logic;
* direct database calls from UI layers;
* UI-dependent financial calculations;
* provider-specific logic leaking throughout the application;
* hard-coded demo users;
* hard-coded production secrets;
* unnecessary global state.

Use shared domain types/contracts where appropriate.

Keep business rules testable independently from frameworks.

---

# 25. DO NOT OVERENGINEER

Production-ready does **not** mean adding unnecessary complexity.

Do not add:

* microservices without a real need;
* Kubernetes merely for appearance;
* blockchain;
* unnecessary machine-learning services;
* dozens of infrastructure dependencies;
* enterprise components without a measurable benefit.

Prefer a strong modular monolith until scale actually requires otherwise.

FINVERSE should remain affordable to launch.

Use:

`docs/06-cheap-launch-path.md`

as an important constraint.

---

# 26. EXTERNAL BLOCKERS

The following may genuinely require the owner:

* Plaid/Flinks/Open Banking commercial approval;
* real provider credentials;
* Apple Developer account;
* Mac/Xcode for iOS builds;
* Google Play developer account;
* hosting credentials;
* cloud credentials;
* KMS credentials;
* production domains;
* email/SMS provider accounts;
* privacy-policy legal review;
* terms-of-service review;
* regulatory/legal review;
* professional security penetration test.

Do not fabricate these.

Instead:

1. finish the architecture;
2. create safe environment-variable/configuration hooks;
3. provide sandbox/mock support;
4. document exactly what credential/action is eventually required;
5. continue with the rest of the project.

---

# 27. DOCUMENTATION

Keep project documentation synchronized with reality.

Update documentation when architecture changes.

Maintain useful documentation covering:

* local development;
* environment variables;
* authentication;
* architecture;
* bank integration;
* database;
* mobile setup;
* testing;
* CI;
* privacy;
* security;
* deployment;
* backups;
* key rotation;
* external prerequisites.

Remove outdated claims when discovered.

---

# 28. GIT DISCIPLINE

First inspect the existing Git state.

Because the repository contains existing uncommitted work, do not blindly commit changes belonging to earlier agents unless you understand them.

When commits are appropriate, make professional, logically grouped commits.

Examples:

`feat(auth): implement secure session authentication`

`feat(banking): add provider-neutral sync architecture`

`feat(mobile): add transaction management screens`

`feat(goals): implement persistent savings goals`

`feat(reports): add monthly financial report generation`

`security(api): enforce per-user authorization and rate limits`

`test(auth): add cross-user access regression coverage`

`docs(security): document threat model and data controls`

Do not create meaningless commits just to increase contribution count.

Commit boundaries should reflect coherent engineering changes.

---

# 29. CONTINUOUS AUTONOMOUS EXECUTION

You have permission to continue from one completed task directly into the next.

Do not repeatedly ask:

* “Should I continue?”
* “Would you like me to implement the next phase?”
* “Do you want me to run the tests?”

Instead, continue automatically whenever the next action is safe and technically justified.

Use the repository, tests, architecture, mission, and product goal to determine what comes next.

When several tasks are available, prioritize by:

1. security vulnerability;
2. data-loss/corruption risk;
3. authentication/user isolation;
4. architectural blocker;
5. core financial functionality;
6. mobile usability;
7. reliability;
8. privacy;
9. performance;
10. polish.

---

# 30. DEFINITION OF DONE

Do not declare FINVERSE “complete” simply because the code builds.

A feature is complete only when appropriate aspects of the following are satisfied:

* implemented;
* integrated;
* persistent where necessary;
* authorized;
* validated;
* secure;
* tested;
* handles errors;
* handles empty states;
* handles loading states;
* usable from the mobile app when user-facing;
* documented;
* does not break existing functionality.

---

# 31. FINAL PROJECT READINESS REVIEW

After completing all feasible engineering work, perform an adversarial production-readiness review.

Attempt to identify:

* security vulnerabilities;
* authorization bypasses;
* privacy leaks;
* missing validations;
* data-loss scenarios;
* race conditions;
* duplicate transaction issues;
* sync failures;
* financial calculation mistakes;
* poor mobile UX;
* broken migrations;
* untested critical paths;
* operational gaps;
* scalability bottlenecks;
* misleading financial claims.

Fix every issue that can reasonably be fixed locally.

Then run the final validation suite.

---

# 32. FINAL HANDOFF FORMAT

Only after exhausting feasible work, produce an updated status containing:

## Completed

What now genuinely works.

## Verification

Exact builds/tests/checks successfully run.

## Security posture

What protections are implemented.

## Mobile status

What screens and workflows are usable.

## Database status

Persistence/migrations/RLS/security status.

## Banking integration status

What is implemented vs what requires credentials.

## Remaining blockers

Only genuine remaining blockers.

## Owner actions

Exact actions Samuel must eventually perform.

## Production launch blockers

Anything preventing accepting real financial users.

## Recommended next milestone

The most important next milestone after external dependencies are resolved.

Do not exaggerate completion.

Do not mark mocked systems as production integrations.

Do not call the system secure merely because tests pass.

---

# CURRENT MISSION

Begin by inspecting:

`C:\Users\samue\OneDrive\Desktop\starter`

Verify Terra 5.6's handoff against the real repository.

Protect the existing working tree.

Then begin implementing the highest-priority missing production functionality.

**Do not stop at analysis or planning. Execute, test, fix, integrate, and continue through the backlog until only genuine external blockers remain.**
