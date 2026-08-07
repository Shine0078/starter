# ADR-0003: Money is an integer in minor units

**Status:** Accepted · **Date:** 2026-08-07

## Context

Every monetary value in the system needs a representation. The obvious candidates are
IEEE-754 floats, arbitrary-precision decimals, and integers in the currency's smallest
unit.

Floats are disqualified immediately: `0.1 + 0.2 === 0.30000000000000004`. In a
budgeting app that surfaces as a total that is a cent off, repeatedly, in a context
where users are checking our arithmetic against their bank's.

## Decision

**All monetary amounts are `bigint` in the currency's minor unit** — cents for USD,
pence for GBP, and correctly zero-decimal for JPY and KRW.

Amounts are always paired with an ISO 4217 currency code. The `Money` type is
`{ amount: bigint | number, currency: string }` and `addMoney` **throws** on a currency
mismatch rather than silently coercing. Cross-currency arithmetic requires an explicit
conversion carrying the rate and the timestamp it was quoted at.

**Sign convention: negative means money leaving the user.** A coffee is `-450`. Salary
is positive. Net cash flow is therefore a plain sum with no branching, and a bug in
sign handling shows up as an obviously wrong number rather than a subtly wrong one.

In Postgres the column type is `bigint`. In TypeScript, values from the DB arrive as
`number`; this is safe because `Number.MAX_SAFE_INTEGER` is about 9.007 × 10¹⁵ minor
units — roughly $90 trillion — which is comfortably beyond any personal balance sheet.

## Consequences

**Good:** exact arithmetic, no rounding drift, trivially serializable as JSON numbers,
and directly comparable to what aggregator APIs return (Plaid and friends already use
minor units). Currency mismatches fail loudly at the point of the mistake.

**Bad:** every display path must divide by the currency's exponent, and every input
path must multiply. Forgetting either produces an error of 100×, which is at least
extremely visible rather than subtle. A single `formatMoney` / `parseMoney` pair is the
only sanctioned place this conversion happens.

Percentages and rates (interest, savings rate, FX) are **not** money and stay as
floats — precision there is a display concern, not a correctness one.

## Alternatives rejected

- **`numeric`/`DECIMAL` in Postgres with a decimal library in TS.** Correct, but adds
  a dependency, serializes as strings, and is slower to aggregate. Integers give the
  same exactness for a fixed-precision domain.
- **Floats.** See above.
