# ADR-0004: Deterministic rules before machine learning

**Status:** Accepted · **Date:** 2026-08-07

## Context

`MISSION.md` asks for "smart AI categorization" that "continuously improves." The
instinct is to start with a model. We have no labelled data, so a model would be
trained on nothing.

There is also a product constraint that matters more than accuracy: **a user who
corrects a category must never see that mistake again.** An app that recategorizes
Whole Foods as "Restaurants" for the third time after being told twice feels broken,
even if its aggregate accuracy is 92%. Aggregate accuracy is not the metric users
experience; repeat errors are.

## Decision

Three tiers, evaluated in strict priority order, first match wins:

1. **User rules** — deterministic pattern match on the normalized descriptor.
   Confidence `1.0`. Always wins, including over a confident model.
2. **Merchant lexicon** — curated normalized-descriptor → category map, with
   per-entry confidence 0.7–0.95.
3. **Per-user correction learner** — only consulted when tiers 1 and 2 miss,
   and only accepted above a confidence floor. It is a bounded,
   nearest-neighbour model rebuilt from that user's durable `user_manual`
   labels at sync time.
   - Exact normalized-descriptor matches are high confidence; fuzzy matches
     require at least three shared tokens, strong token-set overlap, and a
     clear margin over a different category.
   - Conflicting corrections for one normalized descriptor are ignored rather
     than resolved by recency. It sends no transaction text to a third party.
   - **Fallback:** `Unknown`, confidence `0`. Never guess a category we can't justify.

When a user corrects a transaction, we recategorize it **and offer to create a Tier 1
rule** from the normalized descriptor. This is the mechanism that makes tier 1 grow
and makes the "never twice" guarantee real.

Every transaction records `category_source` and `category_confidence`, so the UI can
distinguish "you told us this" from "we think this" — and so we can measure each tier
independently.

### Descriptor normalization

Bank descriptors are hostile. Before any matching:

```
SQ *BLUE BOTTLE 0093 SAN FRAN CA   →  blue bottle
AMZN Mktp US*2K4L9RT21             →  amzn mktp us
TST* SWEETGREEN 1042               →  sweetgreen
POS DEBIT SHELL OIL 574812         →  shell oil
```

Strip processor prefixes (`SQ *`, `TST*`, `PAYPAL *`, `POS DEBIT`), trailing reference
and store numbers, and city/state tails. Lowercase, collapse whitespace.

## Consequences

**Good:** works on day one with no training data. Fully explainable — we can always
say why a transaction got its category, which the mission requires. User corrections
compound into a personal, deterministic system that gets better per-user immediately
rather than after a retraining cycle. One-off corrections also give Tier 3 a safe,
explainable personal example without needing an external model or a global
training-data retention path.

**Bad:** the lexicon needs curation, which is ongoing manual work. Coverage is
regional — a lexicon tuned for US merchants performs poorly in Canada or the UK, so
each new market carries a lexicon cost. Tier 2 will plateau somewhere around 85% on
common merchants, and long-tail/local businesses without a strong personal correction
stay `Unknown`.

Leaving low-confidence transactions as `Unknown` rather than guessing means a visible
"needs review" queue. We consider that a feature: it is honest, and it is the fastest
path to collecting the corrections that train tier 3.

## Alternatives rejected

- **LLM-per-transaction.** Too slow, too expensive at volume, non-deterministic across
  runs, and it would mean sending attacker-controlled merchant strings to a model —
  see the prompt-injection row in [03-security-privacy.md](../03-security-privacy.md).
- **Aggregator-supplied categories only.** Plaid and others return a category. They are
  coarse, inconsistent across providers, and would make our output vary by which
  aggregator serves a given country. Useful as a *signal* into tier 2, not as the answer.
