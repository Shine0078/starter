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
| Tests | 303 without a database, 399 against real PostgreSQL, 21 Flutter tests, and an Android debug APK build; all passing |
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
| 2.1 | **Production bank access** | Plaid Sandbox credentials and the real adapter are configured locally. Charging users still requires Plaid production approval and its security/commercial review | external approval |
| 2.2 | **Link flow** | Completed for Android with Plaid's official native SDK, authenticated Link-token creation, public-token exchange, encrypted permanent tokens, and a mobile Accounts screen | Plaid Dashboard package allowlist remains owner-approved |
| 2.3 | **Reauth / broken-link handling** | Completed: `ITEM_LOGIN_REQUIRED` becomes a visible reconnect state and Link update mode reuses the Item | production institution testing remains |
| 2.4 | **Real sync engine** | Completed: `/transactions/sync` cursors, all-page draining, mutation-safe pagination restart, added/modified/removed reconciliation, pending-to-posted changes, serialized link sync, retry queue, and manual refresh | production load/rate-limit testing remains |
| 2.5 | **Merchant lexicon is tiny** | Categorisation quality on real data is unknown. The top ~2,000 merchants cover most volume; the current lexicon is a fraction of that | 1–2 weeks + ongoing |
| 2.6 | **Categorisation accuracy unmeasured** | 92% coverage on synthetic data the same codebase generated is not evidence. Needs a held-out set of real transactions | ongoing |
| 2.7 | **Multi-currency untested** | `Money` handles it; no path exercises more than USD | 1 week |

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
| 3.2.7 | **Biometric app lock** | **Android implementation complete:** opt-in setting in secure storage, all financial UI hidden on app-switch/background, system authentication with device PIN fallback, sign-out escape path, widget tests, and APK compile. The Dart path supports iOS, but that project is generated/ignored on this Windows repo | Verify enrollment/cancel/lockout behavior on physical Android; configure and validate generated iOS target on a Mac |
| 3.2.8 | **Password blocklist is a small built-in set** | Should check a real corpus via HIBP k-anonymity | days |
| 3.2.9 | **CORS is wide open in development** | Correctly fails closed in production, but the production allowlist has never been exercised | days |
| 3.2.10 | **Secrets management** | `JWT_SECRET` and DB passwords come from env vars. No KMS, no rotation, no vault | 1 week |
| 3.2.11 | **Portable data export** | **Completed technically:** password-confirmed JSON includes profile, sessions, security activity, accounts, transactions, budgets, rules, goals/contributions, notifications/preferences, consent history, and sanitized bank metadata; no password hashes, session-token hashes, or Plaid secrets | Counsel must approve DSAR procedure and scope |
| 3.2.12 | **Consent and retention records** | **Consent wiring is complete technically:** analytics/product-update choices default off; grants/withdrawals are append-only; registration requires exact configured Terms/Privacy versions; the user and legal evidence commit atomically; records are RLS-isolated, exported, visible, and erased with the account. Production fails closed without four `LEGAL_*` settings | Counsel must supply/approve the actual legal text, immutable version ids, URLs, and retention evidence |
| 3.2.13 | **No penetration test** | A finance product should not take its first real user without one | 2–4 weeks + fixes |
| 3.2.14 | **No threat model document** | The abbreviated table in the docs is a sketch, not a threat model | 1 week |

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
| 4.8 | **No rate limiting beyond in-process** | `@nestjs/throttler` keeps counters in memory, so limits reset on restart and are per-instance. Redis is in `docker-compose.yml` and the API does not reference it once | days |
| 4.9 | **No general scheduler** | Plaid webhooks use a durable PostgreSQL retry queue, but scheduled purge, proactive notification refresh, and recurring report delivery still need platform jobs | external host + days |
| 4.10 | **No load or performance testing** | "Scalable to millions" is currently an aspiration with no measurement behind it | 1 week |
| 4.11 | **No staging environment** | Nowhere to verify a release before users get it | with 4.2 |
| 4.12 | **Production migration orchestration** | Idempotence is tested and the image defaults `MIGRATE_ON_BOOT=false`; the release guide defines the step | Must wire into selected host |

---

## 5. The mobile app is an early product

The app now has authentication/recovery, a dashboard, category-spending chart,
searchable transactions, category corrections, budgets, goals, email verification,
recoverable deletion, password-confirmed Android bank connection/reconnect,
sync/revoke, versioned legal acceptance, and privacy controls. It remains
smaller than the complete MISSION.md product.

| # | Item | Detail | Effort |
|---|---|---|---|
| 5.1 | **Core navigation started** | Onboarding, home, transaction search/detail/correction, budgets, goals, bank accounts, subscriptions, notifications, settings/session controls, portable export, versioned legal/optional consent history, device app lock, and recent security activity are implemented | 2–3 weeks for remaining breadth/polish |
| 5.2 | **Read-only offline cache implemented** | Authenticated GET responses can fall back to a 30-day, user-scoped encrypted cache with a visible stale-data banner. Offline writes, background reconciliation, and conflict handling remain | 2–3 weeks |
| 5.3 | **No state management** | `setState` only. Honest at one screen, unworkable at twenty | with 5.1 |
| 5.4 | **No push notifications** | Persistent preferences and a mobile centre now cover budgets, utilization, low balances, bank sync, upcoming bills, subscription price rises, possible duplicates, and conservative spending outliers. Device push delivery remains | external push credentials + 1–2 weeks |
| 5.5 | **Android identity and launcher** | **Completed:** `com.finverse.finance`, FINVERSE label, versioned platform project, and branded launcher asset | Store listing still external |
| 5.6 | **Release signing credentials** | Gradle and the release workflow are wired for an upload key and refuse a distributable release without secrets | User must generate and protect the upload key |
| 5.7 | **iOS never built** | Requires a Mac. Untested and unverified | 1 week |
| 5.8 | **Mobile testing is still thin** | 10 tests cover auth protocol, recovery, deletion, and navigation. No device integration or golden tests | 2 weeks |
| 5.9 | **Accessibility audit incomplete** | Core spending, budget, and health visuals now have spoken equivalents and an automated 200% text-scaling overflow test. Physical VoiceOver/TalkBack, contrast, colour-blind, and one-handed audits remain | device testing + 1–2 weeks |
| 5.10 | **No localisation** | Mission asks for multiple languages. Single hardcoded locale | 1–2 weeks |
| 5.11 | **No crash reporting** | "Crash-free above 99.9%" cannot be claimed without measuring it | days |
| 5.12 | **No app store assets** | Screenshots, descriptions, privacy nutrition labels, data-safety declarations | 1 week |

---

## 6. You cannot take money

Completely absent from the repository. There is no billing code of any kind.

| # | Item | Effort |
|---|---|---|
| 6.1 | **Pricing model decided** — free tier, trial, subscription tiers | product decision |
| 6.2 | **Payment integration** via hosted checkout. Keep card entry out of your own forms or PCI scope explodes — the docs are right about this and it is worth defending | 1–2 weeks |
| 6.3 | **Subscription lifecycle** — trials, upgrades, downgrades, dunning, cancellation, refunds | 2 weeks |
| 6.4 | **Entitlement enforcement** — nothing in the API knows what a user has paid for | 1 week |
| 6.5 | **Tax handling** — sales tax / VAT / GST registration and collection | counsel + 1 week |
| 6.6 | **In-app purchase rules** — Apple and Google take a cut and have specific requirements for subscriptions sold in-app | 1–2 weeks |

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
- Net worth dashboard — no investments, loans, or property
- Notifications and smart reminders — persistent preferences and deduplicated
  in-app budget, credit-utilization, low-balance, bank-sync, upcoming-bill,
  subscription-price-rise, possible-duplicate, and spending-outlier alerts exist;
  push delivery still requires platform credentials and a background delivery job
- Fraud and anomaly detection — exact recent duplicate prompts and conservative
  category outliers are implemented; foreign-spend rules and a trained fraud
  model are not
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
- Weekly/quarterly/yearly/lifetime analytics — only month-to-date exists
- Web dashboard, tablet layouts, smartwatch notifications
- Regional compliance layer

---

## 9. Documentation defects found during this audit

Worth fixing because they cause bad decisions later.

| # | Defect | Location |
|---|---|---|
| 9.1 | Security controls described in the present tense that do not exist | `03-security-privacy.md` — see §3.1 |
| 9.2 | The deletion purge is described in operational detail as though it runs | `02-data-model.md` |
| 9.3 | Redis is provisioned in docker-compose and referenced by zero lines of code | `infra/docker-compose.yml` |
| 9.4 | Test counts drift out of date and are then quoted as evidence — 225/288 were stale until re-measured at 243/309 | fixed in `07-session-notes.md`, but the pattern will recur |
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
