# What blocks selling this

Everything standing between the current repository and charging a stranger money
for this product. Written by auditing the code, not by reading the other
documents — several of them describe the intended design in the present tense,
which reads as coverage that does not exist. Where that happens it is listed
here as a defect.

**Honest one-line summary:** the financial engine, mobile workflows, and Plaid
Sandbox integration are real and tested; production bank access, deployment,
legal review, app-store approval, and billing remain external launch gates.

Effort figures are rough order-of-magnitude for one experienced engineer, and
they exclude the external lead times in §1, which dominate the schedule.

---

## 0. What is genuinely done

Stated so the rest of this document is not read as "nothing works".

| Area | State |
|---|---|
| Financial math | Money as integer minor units, categorisation, budgets, insights, subscription detection, health score, cash-flow forecast, credit-card planner, purchase simulator, CSV export, monthly PDF report |
| Authentication | Argon2id, rotating refresh tokens with reuse detection, email verification, password reset, TOTP MFA/recovery codes, device app lock, recoverable deletion, global guard, per-account lockout, session list, audit trail |
| Persistence | Postgres behind ports, contract-tested against both adapters, migrations |
| Isolation | Row-level security, app connects as a non-superuser role, 21 dedicated tests |
| Tests | 384 without a database, 485 against real PostgreSQL, 56 Flutter tests, Android debug and web release builds; all passing |
| CI | GitHub Actions: API typecheck/test/build/image + Flutter analyze/test/Android compile; tagged API/APK releases |

That is a solid Phase-0 foundation. It is not a product.

---

## 1. Commercial and legal — start these first, they gate everything

None of these can be written in code, and every one of them has a lead time
measured in weeks. Nothing else on this list matters until these move.

| # | Item | Why it blocks | Rough lead time |
|---|---|---|---|
| 1.1 | **Aggregator agreement** (Plaid / Flinks / TrueLayer / Tink) | No real bank data exists without it. This is *the* blocker | 4–12 weeks incl. their security review |
| 1.2 | **Business entity + KYC/AML on you as their customer** | Aggregators and payment processors will not contract with an individual | 2–6 weeks |
| 1.3 | **Privacy counsel review** of the data flows, privacy policy, and terms | You are processing financial data for third parties | 2–4 weeks |
| 1.4 | **Registered domain** | Needed for TLS, email deliverability, and passkeys (relying-party id) | days |
| 1.5 | **Apple Developer + Google Play accounts** | Finance apps get extra scrutiny and a review cycle | 1–4 weeks |
| 1.6 | **Payment processor account** (Stripe or equivalent) | You cannot charge without one | 1–2 weeks |
| 1.7 | **Regulatory positioning check** | The app produces recommendations about money. Whether that is "financial advice" in your jurisdiction is a question for counsel, not for engineering. Get it answered before marketing copy is written | with 1.3 |
| 1.8 | **Cyber/professional liability insurance** | Usually a precondition of the aggregator agreement | 2–4 weeks |

---

## 2. The product is running on fake data

| # | Item | Detail | Effort |
|---|---|---|---|
| 2.1 | **Production bank access** | The Plaid Sandbox adapter is implemented and this workstation has user-scoped Sandbox credentials; the live Sandbox path has been verified through Link-token creation, exchange, five-account import, idempotent incremental sync, and cleanup. No production key or institution approval exists. Charging users still requires Plaid production approval and its security/commercial review | external approval |
| 2.2 | **Link flow** | Completed in source for Android and iOS with Plaid's official native SDKs, authenticated Link-token creation, public-token exchange, encrypted permanent tokens, and a mobile Accounts screen; the PWA uses Plaid Link for Web | Plaid Dashboard package/redirect allowlisting and Mac/Xcode device verification remain owner-approved |
| 2.3 | **Reauth / broken-link handling** | Completed: `ITEM_LOGIN_REQUIRED` becomes a visible reconnect state and Link update mode reuses the Item | production institution testing remains |
| 2.4 | **Real sync engine** | Completed: `/transactions/sync` cursors, all-page draining, mutation-safe pagination restart, added/modified/removed reconciliation, pending-to-posted changes, serialized link sync, retry queue, and manual refresh | production load/rate-limit testing remains |
| 2.5 | **Merchant lexicon is tiny** | Categorisation quality on real data is unknown. The top ~2,000 merchants cover most volume; the current lexicon is a fraction of that | 1–2 weeks + ongoing |
| 2.6 | **Categorisation accuracy unmeasured** | 92% coverage on synthetic data the same codebase generated is not evidence. Needs a held-out set of real transactions | ongoing |
| 2.7 | **Multi-currency partially implemented** | The mobile net-position chart never combines currencies, and cash-flow/purchase planning is explicitly currency-selectable and API-tested. Monthly insights, budgets, subscriptions, goals, and reports still assume one reporting currency at a time; live mixed-currency institution testing remains | 1 week |

---

## 3. Security and privacy — claims that are not yet true

These are listed separately because `03-security-privacy.md` currently describes
several of them in the present tense. **Anyone reading that document today would
believe controls exist that do not.** Fixing the wording is part of the work.

### 3.1 Previously documented as if implemented, but absent

| # | Control | Doc says | Reality |
|---|---|---|---|
| 3.1.1 | TLS 1.3, HSTS, certificate pinning | "In transit" row of the encryption table | Nothing. No TLS config anywhere; the API serves plain HTTP |
| 3.1.2 | Field-level AES-256-GCM envelope encryption via KMS | Table row, plus per-user data keys and master-key rotation | Not implemented. `email` and every other field are plaintext |
| 3.1.3 | SQLCipher-encrypted local SQLite on device | "On device" row | **Partially complete:** user-scoped SQLite cache payloads use AES-256-GCM with a keystore key, authenticated context, expiry, and purge. Whole-file SQLCipher remains a threat-model decision because cache metadata is not encrypted |
| 3.1.4 | Encrypted backups with second-approver restore | "Backups" row | Guarded backup and `_restore_test` scripts exist; production scheduling, encrypted storage, access approval, and a recorded drill remain |
| 3.1.5 | No standing production access, audited break-glass | "Access control" section, present tense | No production exists; no access control process exists |
| 3.1.6 | Deletion purge job at +30 days | `02-data-model.md` previously described it as present | Implemented and proven against PostgreSQL; production still needs to schedule the command |

The security and data-model documents now distinguish implemented controls from
targets. The infrastructure-backed controls below still need a real production
environment before they can be claimed.

### 3.2 Genuinely missing controls

| # | Item | Why it blocks selling | Effort |
|---|---|---|---|
| 3.2.1 | **Account deletion** | **Completed:** password re-verification, typed confirmation, immediate session revocation, 30-day recovery, mobile UI, purge command, and owner-level PostgreSQL erasure proof | Deployment must schedule the job |
| 3.2.2 | **Email verification** | One-time hashed-token API, mobile confirmation, and SMTP adapter are complete | Real email provider credentials and deliverability setup remain |
| 3.2.3 | **Password reset** | Enumeration-safe request, one-time reset, password policy, session revocation, mobile flow, and SMTP adapter are complete | Real email provider credentials remain |
| 3.2.4 | **MFA / TOTP** | **Completed technically:** AES-256-GCM encrypted secrets, five-minute hashed login challenges, replay-resistant TOTP, ten one-time hashed recovery codes, audit events, account erasure, API/mobile enrollment and login UI | Configure and protect `MFA_ENCRYPTION_KEY`; validate enrollment/recovery on physical devices |
| 3.2.5 | **Passkeys / WebAuthn, OAuth2 + PKCE** | Mission names both. Absent. Needs 1.4 | 2–3 weeks |
| 3.2.6 | **Step-up auth** for linking and export | **Completed:** deletion, portable export, and every new/update Plaid Link session re-verify the current password; bank-link attempts are rate-limited and added to the security activity trail | Hardware/production institution verification remains |
| 3.2.7 | **Biometric app lock** | **Android implementation complete:** opt-in setting in secure storage, all financial UI hidden on app-switch/background, system authentication with device PIN fallback, sign-out escape path, widget tests, and APK compile. The iOS Dart path and checked-in native target are also wired for Keychain/Face ID | Verify enrollment/cancel/lockout behavior on physical Android and iOS; complete the Mac/Xcode build |
| 3.2.8 | **Password blocklist is a small built-in set** | Should check a real corpus via HIBP k-anonymity | days |
| 3.2.9 | **CORS is wide open in development** | Correctly fails closed in production, but the production allowlist has never been exercised | days |
| 3.2.10 | **Secrets management** | `JWT_SECRET` and DB passwords come from env vars. No KMS, no rotation, no vault | 1 week |
| 3.2.11 | **Portable data export** | **Completed technically:** password-confirmed JSON includes profile, sessions, security activity, accounts, transactions, budgets, rules, goals/contributions, notifications/preferences, consent history, and sanitized bank metadata; no password hashes, session-token hashes, or Plaid secrets | Counsel must approve DSAR procedure and scope |
| 3.2.12 | **Consent and retention records** | **Consent wiring is complete technically:** analytics/product-update choices default off; grants/withdrawals are append-only; registration requires exact configured Terms/Privacy versions; the user and legal evidence commit atomically; records are RLS-isolated, exported, visible, and erased with the account. Production fails closed without four `LEGAL_*` settings | Counsel must supply/approve the actual legal text, immutable version ids, URLs, and retention evidence |
| 3.2.13 | **No penetration test** | A finance product should not take its first real user without one | 2–4 weeks + fixes |
| 3.2.14 | **Threat model** | **Completed at repository level:** assets, trust boundaries, entry points, a 20-item threat register, abuse regressions, review triggers, and production acceptance gates are in `10-threat-model.md` | Independent security review and deployment-specific update remain |

---

## 4. There is nowhere to run it

This is the most under-represented gap in the existing documentation. The repo
has a `docker-compose.yml` for local development and a CI workflow. That is all.

| # | Item | Detail | Effort |
|---|---|---|---|
| 4.1 | **API container image** | **Completed:** non-root Node 22 multi-stage image with health check | Docker daemon on this workstation remains unavailable for a local image build |
| 4.2 | **No hosting** | No cloud account, no infrastructure-as-code, no environments | 1–2 weeks |
| 4.3 | **No hosting deployment** | Tagged releases now publish the API image and APK; no provider has been selected to receive the image | external account + days |
| 4.4 | **No managed database** | No provisioning, no connection pooling at scale, no read replicas | days |
| 4.5 | **Backups not scheduled** | Backup and guarded restore-drill scripts now exist; storage, encryption policy, schedule, and a real drill need a production database | external account + drill |
| 4.6 | **No monitoring, metrics, or alerting** | `/healthz` now fails with HTTP 503 when PostgreSQL is down; nothing external scrapes or alerts on it | 1 week |
| 4.7 | **External error tracking absent** | Structured request logs now carry correlation ids and deliberately omit headers, bodies, queries, users, merchants, and amounts; no external log/error service is configured | external account + days |
| 4.8 | **Shared rate limiting** | **Completed for the PostgreSQL launch path:** opaque fixed-window counters and block state are atomic across API instances and survive restarts. The memory development path remains process-local by design | production load testing remains |
| 4.9 | **No general scheduler** | Plaid webhooks use a durable PostgreSQL retry queue, but scheduled purge, proactive notification refresh, and recurring report delivery still need platform jobs | external host + days |
| 4.10 | **Production capacity not established** | A guarded authenticated smoke now runs in CI against PostgreSQL and fails on any error or p95 above 750 ms. Local 250-request/concurrency-10 baseline: 0 failures, 229.1 ms p95, 146.8 req/s. Staging soak and provider-limit tests remain | selected host + days |
| 4.11 | **No staging environment** | Nowhere to verify a release before users get it | with 4.2 |
| 4.12 | **Production migration orchestration** | Idempotence is tested and the image defaults `MIGRATE_ON_BOOT=false`; the release guide defines the step | Must wire into selected host |

The repository now includes a provider-neutral Caddy/Docker Compose public-edge
recipe. It removes the Tailscale dependency once an owner supplies a domain,
public host, and managed PostgreSQL instance; no provider has been selected or
operated yet.

---

## 5. The mobile app is an early product

The app now has authentication/recovery, a dashboard, category-spending chart,
searchable transactions, category corrections, budgets, goals, email verification,
recoverable deletion, password-confirmed Android bank connection/reconnect,
sync/revoke, versioned legal acceptance, and privacy controls. It remains
smaller than the complete MISSION.md product.

| # | Item | Detail | Effort |
|---|---|---|---|
| 5.1 | **Core navigation started** | Onboarding, currency-safe net position, user-managed cash/offline assets/loans, cash-flow planning and purchase scenarios, transaction search/detail/correction, budgets, goals, bank accounts, subscriptions, notifications, plan and paywall, settings/session controls, portable export, versioned legal/optional consent history, device app lock, and recent security activity are implemented | 2–3 weeks for remaining breadth/polish |
| 5.2 | **Offline cache and idempotent preference queue implemented** | Authenticated GET responses fall back to a 30-day, user-scoped encrypted cache; transaction preference edits queue offline, collapse to the latest value, replay on resume, and show pending/stale state. Bank balances remain server-authoritative; OS background reconciliation and broader conflict UX remain | native background scheduling + 1–2 weeks |
| 5.3 | **No state management** | `setState` only. Honest at one screen, unworkable at twenty | with 5.1 |
| 5.4 | **Remote push still absent; local alerts implemented** | Persistent preferences and the mobile centre cover budgets, utilization, low balances, bank sync, upcoming bills, subscription price rises, possible duplicates, and conservative spending outliers. Android/iPhone local delivery can surface unread alerts after a refresh; remote push delivery remains | external push credentials + background job |
| 5.5 | **Android identity and launcher** | **Completed:** `com.finverse.finance`, FINVERSE label, versioned platform project, and branded launcher asset | Store listing still external |
| 5.6 | **Release signing credentials** | Gradle and the release workflow are wired for an upload key and refuse a distributable release without secrets | User must generate and protect the upload key |
| 5.7 | **iOS never built** | Requires a Mac. Untested and unverified | 1 week |
| 5.8 | **Mobile testing is still thin** | 56 widget/design tests cover auth protocol, persisted-session refresh, concurrent refresh, recovery, deletion, navigation, transaction filters, offline cache, accessibility scaling, analytics visuals, reactive data invalidation, notification preferences, and plan/paywall paths. No device integration or golden tests | 2 weeks |
| 5.9 | **Accessibility audit incomplete** | Core spending, budget, and health visuals now have spoken equivalents and an automated 200% text-scaling overflow test. Physical VoiceOver/TalkBack, contrast, colour-blind, and one-handed audits remain | device testing + 1–2 weeks |
| 5.10 | **No localisation** | Mission asks for multiple languages. Single hardcoded locale | 1–2 weeks |
| 5.11 | **No crash reporting** | "Crash-free above 99.9%" cannot be claimed without measuring it | days |
| 5.12 | **No app store assets** | Screenshots, descriptions, privacy nutrition labels, data-safety declarations | 1 week |

---

## 6. Taking money — mechanism built, decisions and accounts outstanding

The web billing path is implemented and tested: hosted checkout, the management
portal, signed webhooks that survive redelivery and out-of-order arrival,
subscription persistence under RLS, and entitlement that fails closed. See
[ADR-0007](adr/0007-billing-and-entitlements.md).

What remains is a product decision, an external account, a filing obligation,
and a second integration for the mobile stores.

| # | Item | State | Effort |
|---|---|---|---|
| 6.1 | **Pricing model decided** — tiers, trial, what belongs behind the paywall | **Completed and implemented.** Free/Pro split on "the past is free, the future is paid", monthly and annual billing, 14-day trial, and gates that are inert until a payment provider is configured. Price points are a recommendation argued from competitor pricing and this product's aggregator costs — see [09-pricing.md](09-pricing.md) | Owner to confirm the numbers |
| 6.2 | **Payment integration** via hosted checkout | **Completed.** Stripe Checkout and Billing Portal; no card data reaches this system, so PCI scope stays out | Stripe account required |
| 6.3 | **Subscription lifecycle** — trials, upgrades, cancellation, dunning, refunds | **Completed** by delegating to the provider's hosted portal and reacting to its webhooks. `past_due` deliberately stays entitled while dunning runs | — |
| 6.4 | **Entitlement enforcement** | **Completed.** `effectivePlan()` derives the plan and fails closed on a missing record, unknown status, lapsed period, or unrecognised price. `EntitlementGuard` gates any route with one decorator | — |
| 6.5 | **Tax handling** — sales tax / VAT / GST | Stripe Tax is enabled on checkout, which computes and collects. **Registering** in each jurisdiction is a filing obligation, not a flag | counsel + registration |
| 6.6 | **In-app purchase rules** | **Not started, and not a variant of 6.2.** Apple and Google require their own purchase systems for digital subscriptions sold inside an app and take a cut; pointing a "Subscribe" button in the Flutter app at Stripe Checkout would likely be rejected by both stores. StoreKit and Play Billing are a separate integration with their own receipt validation. `Subscription` is provider-shaped so a second adapter fits behind the same port. The client ships in `informational` mode until this is resolved — see 6.7 | 2–3 weeks |
| 6.7 | **Upgrade UI in the mobile client** | **Completed.** A plan screen (current tier, renewal state, what each tier includes, failed-payment prompt, portal link), and a paywall sheet any screen gets for free because the client turns the API's `plan_upgrade_required` 403 into a typed exception. The bank-link limit is checked before the password prompt so nobody authenticates with their bank only to be refused. Purchasing is behind `BILLING_PURCHASE_MODE`, which defaults to `informational` — the only value safe in every distribution channel until 6.6 is settled | — |

---

## 7. No way to support a customer

| # | Item |
|---|---|
| 7.1 | No support channel, help centre, or in-app contact route |
| 7.2 | No admin tooling — no way to look up a user's problem without raw SQL, which RLS now (correctly) blocks |
| 7.3 | No incident process, on-call, or status page |
| 7.4 | No analytics or product telemetry is installed. A default-off, versioned consent surface now exists before any analytics SDK is introduced |
| 7.5 | The versioned registration gate, document links, and evidence trail exist, but no counsel-approved Terms of Service or Privacy Notice is shipped |
| 7.6 | No onboarding or user documentation |

---

## 8. Mission features still incomplete

Tracked separately from bugs and gaps: these are promises in `MISSION.md` with
no implementation. Roughly in descending order of how prominently the mission
features them.

**Named repeatedly / core to the pitch**

- Conversational AI assistant (needs a zero-retention LLM agreement first)
- ML categoriser trained on user corrections — rules-only today
- Monthly PDF report core is complete — a private three-page report now covers
  summary metrics, cash-flow comparisons, spending categories, budgets,
  subscriptions, a 30-day forecast, and an action plan. The mission's later
  investment, tax, fraud, and AI sections depend on those underlying features.
- Goals and savings targets — persistent model, progress math, contribution history, API, RLS, and Flutter screen are complete
- Net-position dashboard — connected and manual assets/debts are charted
  separately per currency; full investment holdings, property-specific fields,
  valuations, and historical net-worth snapshots remain
- Notifications and smart reminders — persistent preferences and deduplicated
  in-app budget, credit-utilization, low-balance, bank-sync, upcoming-bill,
  subscription-price-rise, possible-duplicate, and spending-outlier alerts exist;
  push delivery still requires platform credentials and a background delivery job
- Fraud and anomaly detection — exact and near-descriptor duplicate prompts, conservative
  category outliers, and explainable refund matching are implemented; foreign-spend
  rules and a trained fraud model are not
- Receipt OCR

**Named once, clearly later-phase**

- Gamification (achievements, streaks, challenges, levels)
- Family mode, shared budgets, expense splitting
- Travel mode with FX
- Business mode (tax categories, mileage, invoices)
- Smart natural-language search
- Investment and crypto tracking
- Financial calendar, custom automation rules, life timeline
- Bill negotiation, merchant offers, financial marketplace
- Lifetime analytics and custom analytics UX now cover week/month/3m/6m/year/lifetime
  periods and server-side custom ranges.
- Web dashboard, tablet layouts, smartwatch notifications
- Regional compliance layer

---

## 9. Documentation defects found during this audit

Worth fixing because they cause bad decisions later.

| # | Defect | Location |
|---|---|---|
| 9.1 | Security controls described in the present tense that do not exist | `03-security-privacy.md` — see §3.1 |
| 9.2 | The deletion purge is described in operational detail as though it runs | `02-data-model.md` |
| 9.3 | Unused Redis was provisioned despite zero application references | Fixed: shared rate limits and webhook jobs use PostgreSQL, and Redis was removed from the cheap-launch stack |
| 9.4 | Test counts drift out of date and are then quoted as evidence — older counts were stale until re-measured at 384/485/56 | fixed in `07-session-notes.md`, but the pattern will recur |
| 9.5 | `06-cheap-launch-path.md` describes a *personal beta*, not a sellable product. It is correct for what it is, and should say so at the top so it is not mistaken for a launch plan | `06-cheap-launch-path.md` |

---

## 10. Suggested order

Sequenced by dependency and by what is unblocked today.

**Now, in parallel with nothing:** start §1. Everything else waits on it and it
is pure calendar time.

**While waiting — fully unblocked engineering, roughly this order:**

1. Configure the SMTP adapter with a production delivery provider and validate
   SPF/DKIM/DMARC once credentials exist (3.2.2, 3.2.3)
2. Keep the documentation honest as production controls land
3. Select hosting, wire deployment, schedule backups, and add monitoring (§4)
4. Mobile app past the prototype (§1 of §5) — the longest single track, start early
5. Secrets management and physical-device MFA acceptance (3.2.4, 3.2.10)
6. Billing (§6) — only once there is something worth paying for

**Blocked until §1 lands:** everything in §2, passkeys (needs the domain), the
LLM assistant (needs a zero-retention contract), app store submission.

---

## The short answer

Three things make this unsellable today, and they are not the same size:

1. **It has never seen a real bank.** Gated on a commercial agreement, not code.
2. **The mobile app covers the first daily workflows, not the full product.**
   Offline writes and several mission-scale surfaces still remain; legal-policy text
   and versions require owner/counsel decisions.
3. **There is no live production deployment and no way to charge.** Release
   artifacts exist, but provider accounts and production wiring do not.

Everything else on this list is real, but those three decide the date.
