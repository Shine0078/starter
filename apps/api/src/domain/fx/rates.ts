/**
 * Dated exchange rates, with provenance.
 *
 * FINVERSE has refused to combine currencies since ADR-0003, and that refusal
 * was correct while there was no rate to combine them with. What it cost was a
 * user with accounts in two currencies never seeing a single net-worth figure.
 *
 * This module removes the refusal without removing the honesty: a conversion
 * happens only against a rate that has a date and a stated source, and every
 * converted total carries both so the reader can judge it. An invented or
 * undated rate stays exactly as unacceptable as it was.
 */

import type { IsoDate } from '../types';

export type RateSource = 'manual' | 'provider' | 'statement';

export const RATE_SOURCES: readonly RateSource[] = ['manual', 'provider', 'statement'];

export interface FxRate {
  id: string;
  /** ISO 4217, uppercase. One unit of `base` costs `rate` of `quote`. */
  base: string;
  quote: string;
  /**
   * Stored as a float, deliberately.
   *
   * A rate is a ratio, not an amount — it has no minor unit, and forcing it
   * into integers would need an arbitrary scale factor that leaks into every
   * comparison. Amounts stay integers; only the multiplier is a float, and the
   * result is rounded back to minor units immediately.
   */
  rate: number;
  asOf: IsoDate;
  source: RateSource;
  /** Free text: which provider, which statement, who typed it. */
  note: string | null;
  createdAt: string;
}

export class NoRateAvailableError extends Error {
  constructor(
    readonly base: string,
    readonly quote: string,
    readonly asOf: string,
  ) {
    super(
      `No ${base}→${quote} rate on or before ${asOf}. Add one before combining ` +
        'these currencies.',
    );
    this.name = 'NoRateAvailableError';
  }
}

export interface RateValidation {
  ok: boolean;
  problems: string[];
}

const CURRENCY = /^[A-Za-z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRate(input: {
  base?: string;
  quote?: string;
  rate?: number;
  asOf?: string;
  source?: string;
}): RateValidation {
  const problems: string[] = [];

  if (!input.base || !CURRENCY.test(input.base)) {
    problems.push('base must be a three-letter currency code.');
  }
  if (!input.quote || !CURRENCY.test(input.quote)) {
    problems.push('quote must be a three-letter currency code.');
  }
  if (
    input.base &&
    input.quote &&
    input.base.toUpperCase() === input.quote.toUpperCase()
  ) {
    // A self-rate is either 1 and pointless, or not 1 and wrong.
    problems.push('base and quote must differ.');
  }

  if (typeof input.rate !== 'number' || !Number.isFinite(input.rate) || input.rate <= 0) {
    problems.push('rate must be a positive number.');
  }

  if (!input.asOf || !ISO_DATE.test(input.asOf)) {
    problems.push('asOf must be a calendar date (YYYY-MM-DD).');
  }

  if (!input.source || !RATE_SOURCES.includes(input.source as RateSource)) {
    problems.push(`source must be one of: ${RATE_SOURCES.join(', ')}.`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The rate to use for a conversion on `asOf`.
 *
 * Picks the most recent rate **on or before** the date, never a later one.
 * Using a future rate would restate history every time a new rate is added,
 * so yesterday's net worth would change overnight without any transaction.
 *
 * An inverse rate is accepted when no direct one exists, because someone who
 * recorded USD→EUR should not have to record EUR→USD as well.
 */
export function findRate(
  rates: readonly FxRate[],
  base: string,
  quote: string,
  asOf: IsoDate,
): { rate: number; used: FxRate; inverted: boolean } | null {
  const from = base.toUpperCase();
  const to = quote.toUpperCase();

  if (from === to) return null;

  let direct: FxRate | null = null;
  let inverse: FxRate | null = null;

  for (const candidate of rates) {
    if (candidate.asOf > asOf) continue;

    const candidateBase = candidate.base.toUpperCase();
    const candidateQuote = candidate.quote.toUpperCase();

    if (candidateBase === from && candidateQuote === to) {
      if (!direct || candidate.asOf > direct.asOf) direct = candidate;
    } else if (candidateBase === to && candidateQuote === from) {
      if (!inverse || candidate.asOf > inverse.asOf) inverse = candidate;
    }
  }

  // A direct rate wins even when an inverse one is newer: it is the figure the
  // user actually recorded for this pair, and inverting introduces error.
  if (direct) return { rate: direct.rate, used: direct, inverted: false };
  if (inverse) return { rate: 1 / inverse.rate, used: inverse, inverted: true };

  return null;
}

export interface Conversion {
  /** Minor units in the target currency. */
  amount: number;
  rate: number;
  rateAsOf: IsoDate;
  source: RateSource;
  inverted: boolean;
  /** True when the rate predates the conversion date by more than a week. */
  stale: boolean;
  staleDays: number;
}

/** Beyond this a rate is labelled stale rather than silently trusted. */
export const STALE_AFTER_DAYS = 7;

/**
 * Converts minor units between currencies.
 *
 * Throws when no rate exists. Returning zero, or the unconverted amount, would
 * put a number on screen that looks like money and is not.
 */
export function convert(
  amountMinor: number,
  base: string,
  quote: string,
  asOf: IsoDate,
  rates: readonly FxRate[],
): Conversion {
  const from = base.toUpperCase();
  const to = quote.toUpperCase();

  if (from === to) {
    return {
      amount: amountMinor,
      rate: 1,
      rateAsOf: asOf,
      source: 'manual',
      inverted: false,
      stale: false,
      staleDays: 0,
    };
  }

  const found = findRate(rates, from, to, asOf);
  if (!found) throw new NoRateAvailableError(from, to, asOf);

  const staleDays = Math.max(
    0,
    Math.round(
      (Date.parse(`${asOf}T00:00:00.000Z`) -
        Date.parse(`${found.used.asOf}T00:00:00.000Z`)) /
        86_400_000,
    ),
  );

  return {
    // Rounded straight back to minor units, so the float never survives into a
    // stored or compared value.
    amount: Math.round(amountMinor * found.rate),
    rate: found.rate,
    rateAsOf: found.used.asOf,
    source: found.used.source,
    inverted: found.inverted,
    stale: staleDays > STALE_AFTER_DAYS,
    staleDays,
  };
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export interface CombinedTotal {
  currency: string;
  amount: number;
  /** Every rate relied on, so the figure can be audited. */
  ratesUsed: Array<{ base: string; quote: string; rate: number; asOf: string; source: RateSource; stale: boolean }>;
  /** Currencies that had no rate. Their amounts are excluded, never guessed. */
  missing: string[];
  /** True when any input currency could not be converted. */
  incomplete: boolean;
}

/**
 * Combines per-currency totals into one figure.
 *
 * A currency with no rate is **excluded and named**, not silently dropped or
 * assumed to be 1:1. A net-worth number that quietly omits an account is worse
 * than one that says it is incomplete, because it looks finished.
 */
export function combineTotals(
  totals: readonly CurrencyTotal[],
  target: string,
  asOf: IsoDate,
  rates: readonly FxRate[],
): CombinedTotal {
  const to = target.toUpperCase();
  const ratesUsed: CombinedTotal['ratesUsed'] = [];
  const missing: string[] = [];
  let amount = 0;

  for (const total of totals) {
    const from = total.currency.toUpperCase();

    if (from === to) {
      amount += total.amount;
      continue;
    }

    try {
      const converted = convert(total.amount, from, to, asOf, rates);
      amount += converted.amount;
      ratesUsed.push({
        base: from,
        quote: to,
        rate: converted.rate,
        asOf: converted.rateAsOf,
        source: converted.source,
        stale: converted.stale,
      });
    } catch {
      missing.push(from);
    }
  }

  return { currency: to, amount, ratesUsed, missing, incomplete: missing.length > 0 };
}
