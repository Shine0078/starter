# ADR-0005: Selective end-to-end encryption, not blanket zero-knowledge

**Status:** Accepted · **Date:** 2026-08-07

## Context

`MISSION.md` asks for two things that cannot both be fully true:

> * End-to-end encrypted sensitive information.
> * Zero-knowledge architecture where possible.

and, in the same document, server-side AI categorization, monthly report generation,
cross-device sync, and a conversational assistant that understands spending habits.

A server that cannot decrypt a transaction descriptor cannot categorize it, cannot
compute a category breakdown, and cannot generate a report. The qualifier "where
possible" is doing enormous load-bearing work, and leaving it unresolved means the
conflict surfaces later as either a broken privacy promise or a broken feature.

This ADR resolves it explicitly rather than letting each engineer decide ad hoc.

## Decision

Encrypt end-to-end the data whose **value is in secrecy**. Leave server-readable the
data whose **value is in computation**. Then say so plainly to users.

| Data | Server-readable | Rationale |
|---|---|---|
| Amounts, dates, descriptors, categories | **Yes** | This *is* the product. Encrypting it means on-device-only ML and no cross-device reports. |
| Aggregator link tokens | No — KMS envelope encryption | Compromise reaches the bank. Highest-value target in the system. |
| Receipt images | No — client-encrypted | OCR runs on-device; only extracted fields are uploaded. |
| Notes, goal names, custom labels, attachments | No — client-encrypted | Free text is where people write things they'd never want read, and there is zero product value in reading it. |

Additional constraints that follow:

- The LLM assistant receives **pre-aggregated, merchant-anonymized summaries only** —
  never raw transaction rows. This also mitigates prompt injection via merchant names,
  which are attacker-controlled strings entering our system.
- Any third-party model provider must be under a **zero-retention agreement** before
  production traffic.
- The privacy dashboard states this split in plain language. Users are told what we
  can compute on and what we cannot read.

## Consequences

**Good:** the promise we make is one we can actually keep, and it is verifiable. Server-side
intelligence — the reason to use the app daily — remains possible. The highest-consequence
secrets (bank access) and the most personal free text get real cryptographic protection
rather than a policy promise.

**Bad:** we cannot market "zero-knowledge" without qualification, and a competitor
willing to be less precise can claim more. A server compromise exposes spending data,
so encryption at rest, RLS, KMS-held keys, and no standing production access are
carrying weight that E2E would otherwise carry.

**Rejected as dishonest:** claiming zero-knowledge while operating server-side
categorization. Several apps in this category do exactly that. Given that privacy is
the stated differentiator, being caught overstating it is an existential risk to the
brand, not a marketing correction.

## Revisit if

On-device models become good enough to categorize locally *and* generate reports
without server compute. At that point the top row of the table can move, and the
decision should be reopened rather than inherited.
