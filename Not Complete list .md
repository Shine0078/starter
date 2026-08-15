**## Not Complete**

**Status legend:** `[x]` implemented and verified in this repository; `[~]`
repository controls exist but production activation still needs an owner/provider;
`[ ]` still outstanding.



**### Production Launch**



**- Permanent domain and HTTPS hosting**

**- Managed production PostgreSQL**

**- Production deployment independent of this PC**

**- [x] Staging environment and release migration process**

**- [~] Production backups, restore drills, monitoring, alerts, and incident response**

**- Production secrets manager and key rotation**

**- Penetration testing and independent security review**

**- Production SMTP/email provider and deliverability setup**

**- Staffed customer support and escalation process**

**- Admin/support tooling**

**- Status page and incident procedures**



**### Banking**



**- Plaid production approval**

**- Plaid production credentials**

**- Real-bank institution testing**

**- Android Plaid package allowlist approval**

**- Native iOS Plaid Universal Links configuration**

**- Production webhook and redirect testing**

**- Real transaction categorization accuracy measurement**

**- Larger real-world merchant coverage**

**- Full mixed-currency institution testing**



**### Mobile Release**



**- Native iOS build and signing**

**- Apple Developer account**

**- Mac/Xcode verification**

**- Physical native iPhone testing**

**- iOS passkey, biometric, camera, notification, and Plaid testing**

**- Android physical-device testing**

**- Android upload keystore and store publishing credentials**

**- Google Play release**

**- Apple App Store/TestFlight release**

**- Store screenshots, descriptions, privacy labels, and data-safety declarations**

**- Physical VoiceOver/TalkBack accessibility audit**

**- Full contrast, color-blind, and one-handed-use audit**

**- Device integration and golden tests**

**- Crash reporting**



**### Notifications**



**- FCM credentials**

**- APNs credentials**

**- Client push-token registration in production**

**- Physical push testing**

**- Production background notification jobs**

**- Proactive recurring-report delivery**



**### Billing**



**- Stripe live account and live keys**

**- Final pricing approval**

**- Live webhook and tax configuration**

**- Billing support, refunds, and dunning operations**

**- Apple StoreKit integration**

**- Google Play Billing integration**

**- Mobile subscription purchase verification**



**### Legal and Compliance**



**- Counsel-approved Terms of Service**

**- Counsel-approved Privacy Notice**

**- Regulatory positioning review**

**- GDPR/CCPA/PIPEDA operational procedures**

**- Data-retention and deletion policy approval**

**- Tax registrations and filing decisions**

**- Cyber/professional liability insurance**



**### Product Features**



**- Free-form AI assistant; current assistant is deterministic**

**- Zero-retention LLM agreement**

**- Global machine-learning categorization model**

**- Held-out real-transaction categorization accuracy evidence**

**- Advanced fraud model and foreign-spend detection**

**- Investment and crypto tracking**

**- [x] Historical net-worth snapshots**

**- [x] Property valuation support (manual, user-controlled valuations)**

**- Family/shared budgets and expense splitting**

**- Travel mode and foreign-exchange tools**

**- Business mode, mileage, invoices, and tax categories**

**- Gamification**

**- [x] Smart natural-language transaction search (deterministic and private)**

**- Bill negotiation and merchant marketplace features**

**- Tablet-specific layouts**

**- Full web dashboard**

**- Smartwatch notifications**



**### Current Deployment Limitation**



**The current link is a Cloudflare quick tunnel:**



**`https://pitch-reveals-network-gazette.trycloudflare.com`**



**It runs from this PC using local PostgreSQL. It is useful for testing, but it is \*\*not a production deployment\*\*. It stops when the PC sleeps, restarts, or loses internet access, and the URL can change when the tunnel restarts.**



**The project is suitable for a controlled Sandbox/private beta, but it is not yet production-ready or commercially sellable.**

---

**## Implementation log — 2026-08-15**

**Staging/release migrations:** added a protected manual GitHub workflow for
`staging` and `production`, exact operator confirmation, environment-scoped
database secrets, pre/post migration inspection, unknown-migration refusal, and
a PostgreSQL advisory lock preventing concurrent release runners.

**Backup/monitoring/incident controls:** CI now performs a real PostgreSQL
backup and isolated restore drill. A scheduled health workflow retries failures,
opens one deduplicated GitHub incident, and resolves it on recovery. The incident
runbook defines severity, containment, database recovery, communications, and
post-incident review. Production backup storage, responder staffing, and an
independently hosted public status page still require external setup.

**Historical net worth:** account updates now record daily assets, debts, and net
position separately by currency. Same-day updates replace old observations,
snapshots are row-level-security protected and deleted with the user, and the
Flutter dashboard shows an accessible history chart without inventing FX rates.

**Property values:** users can now add and update a property as a manual asset,
keep its currency separate, include it in current and historical net position,
and remove it at any time. No address or valuation data is sent to a third-party
real-estate provider.

**Natural-language search:** transaction search now understands combinations of
merchant text, category names, exact/minimum/maximum amounts, pending or recurring
status, relative periods, and named months. The app explains its interpretation;
queries and transactions remain inside FINVERSE and are never sent to an LLM.

