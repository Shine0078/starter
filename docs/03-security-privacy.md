# Security & Privacy

The mission names privacy as the biggest selling point. That only means something if
it constrains engineering decisions that would otherwise go the other way. This
document is the list of those constraints.

## Non-negotiables

1. **We never see bank credentials.** Authentication happens in the aggregator's own
   SDK/webview. We receive an opaque token. There is no code path in this system that
   accepts a banking password, and there must never be one.
2. **We never sell or broker user data.** No ad targeting on spending. No data
   partnerships. This is a business-model commitment enforced by not building the
   pipes: there is no export path to a third-party marketing system.
3. **Deletion is real.** See the purge design in [02-data-model.md](02-data-model.md).
4. **Every AI feature is explainable.** An insight must be able to say which
   transactions produced it. "The model said so" is not acceptable for money.

## Encryption

| Layer | Mechanism |
|---|---|
| In transit | TLS 1.3, HSTS, certificate pinning on mobile |
| At rest (disk) | Managed volume encryption on the database host |
| At rest (field) | AES-256-GCM envelope encryption via KMS for `email`, `provider_item_id`, receipt images |
| On device | OS keystore (Keychain / Android Keystore); local SQLite encrypted with SQLCipher |
| Backups | Encrypted with a separate key; restore requires a second approval |

Field-level encryption uses per-user data keys wrapped by a KMS master key. Rotating
the master key rewraps data keys without rewriting user rows.

## Authentication

- OAuth 2.0 + PKCE, passkeys (WebAuthn) as the primary factor.
- Biometric unlock on device gates the local store, not the account — a stolen phone
  with a compromised fingerprint must not yield a session token that works elsewhere.
- Refresh tokens are rotating and single-use; reuse detection revokes the family.
- Step-up authentication required for: linking an account, exporting data, changing
  notification destinations, and deletion.

## Access control

Every query is scoped by `user_id` at the repository layer, not the controller. Postgres
row-level security is enabled as a second line so that a missing `WHERE` clause fails
closed instead of leaking another user's transactions.

Engineers do not have standing production data access. Break-glass access is
time-boxed, requires a second approver, and emits an audit event the user can see in
their privacy dashboard.

## The zero-knowledge tension — read this before proposing E2E everywhere

The mission asks for **zero-knowledge architecture where possible** *and* for
server-side AI categorization, insights, and monthly reports. These are in direct
conflict: a server that cannot read transaction descriptors cannot categorize them.

Where we landed:

| Data | Server can read? | Why |
|---|---|---|
| Transaction descriptors, amounts, dates | **Yes** | Categorization, insights, and reports are the product. Encrypting these means shipping the ML to the device and abandoning cross-device reports. |
| Aggregator tokens | No — encrypted, KMS-gated | Compromise here reaches the bank. Highest-value target. |
| Receipt images | No — client-side encrypted | OCR runs on-device; only extracted fields are uploaded. |
| Notes, goal names, custom labels | No — client-side encrypted | Free text is where people write things they'd never want read. Zero product value in reading it. |

So: **E2E for the things whose value is in secrecy, server-readable for the things
whose value is in computation.** Saying "zero-knowledge" without this table would be
marketing, and the privacy dashboard states the distinction to users in plain language.

The honest framing for users is *"we can compute on your spending because that's the
product; we cannot read your notes, your receipts, or reach your bank."*

### Sending data to an LLM

The conversational assistant does **not** get raw transaction rows. It gets
pre-aggregated, merchant-anonymized summaries computed server-side, with a strict
allowlist of fields. Concretely: category totals, deltas, and counts — not
`raw_descriptor` strings.

Any third-party LLM provider must be under a zero-retention agreement before a single
production token is sent. Until that contract exists, the assistant runs against
aggregates only, or self-hosted.

## Compliance posture

| Framework | Status | Blocker |
|---|---|---|
| GDPR / CCPA / PIPEDA | Designed for — deletion, export, consent, DSAR path | Needs counsel review, not code |
| SOC 2 Type II | Controls designed; evidence not collected | Requires 6–12mo observation window + auditor |
| PCI DSS | Mostly **out of scope by design** — we never touch card PANs | Stays true only if we never accept card entry |
| Open Banking (PSD2, CDR, UK OBIE) | Handled via aggregator | Their license, not ours, in most regions |

Keeping PCI out of scope is worth defending. The moment the app accepts a card number
directly — even for its own subscription billing — scope explodes. Subscription
billing goes through a hosted processor (Stripe Checkout), never our own form.

## Threat model, abbreviated

| Threat | Mitigation |
|---|---|
| Stolen device | Local store encrypted, biometric gate, remote session revocation |
| Compromised API server | Field encryption keys in KMS, not on the box; RLS limits blast radius |
| Malicious insider | No standing prod access, audited break-glass, user-visible access log |
| Aggregator breach | Tokens are per-user and revocable; we can rotate every link |
| Prompt injection via transaction descriptor | LLM never receives raw descriptors; aggregates only |

That last row is not hypothetical. A merchant name is attacker-controlled text that
reaches our system and would reach the model. Aggregation is the mitigation.

## Related

- [ADR-0005](adr/0005-zero-knowledge-tension.md) — the decision record for the table above
