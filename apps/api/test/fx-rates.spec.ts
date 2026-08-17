import { describe, expect, it } from 'vitest';

import {
  combineTotals,
  convert,
  findRate,
  NoRateAvailableError,
  validateRate,
  type FxRate,
} from '../src/domain/fx/rates';

let counter = 0;
function rate(overrides: Partial<FxRate> = {}): FxRate {
  counter += 1;
  return {
    id: `r${counter}`,
    base: 'EUR',
    quote: 'USD',
    rate: 1.1,
    asOf: '2026-03-01',
    source: 'manual',
    note: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateRate', () => {
  const valid = { base: 'EUR', quote: 'USD', rate: 1.1, asOf: '2026-03-01', source: 'manual' };

  it('accepts a well-formed rate', () => {
    expect(validateRate(valid).ok).toBe(true);
  });

  it('rejects a non-currency code', () => {
    expect(validateRate({ ...valid, base: 'EUROS' }).ok).toBe(false);
  });

  it('rejects a self-rate', () => {
    // Either 1 and pointless, or not 1 and wrong.
    expect(validateRate({ ...valid, quote: 'EUR' }).ok).toBe(false);
  });

  it('rejects a zero or negative rate', () => {
    expect(validateRate({ ...valid, rate: 0 }).ok).toBe(false);
    expect(validateRate({ ...valid, rate: -1 }).ok).toBe(false);
  });

  it('rejects a malformed date and an unknown source', () => {
    expect(validateRate({ ...valid, asOf: '01/03/2026' }).ok).toBe(false);
    expect(validateRate({ ...valid, source: 'vibes' }).ok).toBe(false);
  });
});

describe('findRate', () => {
  it('finds a direct rate', () => {
    const found = findRate([rate()], 'EUR', 'USD', '2026-03-05');
    expect(found?.rate).toBe(1.1);
    expect(found?.inverted).toBe(false);
  });

  it('inverts when only the opposite pair was recorded', () => {
    // Recording EUR→USD should not require also recording USD→EUR.
    const found = findRate([rate()], 'USD', 'EUR', '2026-03-05');
    expect(found?.inverted).toBe(true);
    expect(found?.rate).toBeCloseTo(1 / 1.1, 10);
  });

  it('prefers a direct rate over a newer inverse one', () => {
    // The direct figure is what the user recorded for this pair; inverting
    // introduces error.
    const rates = [
      rate({ base: 'EUR', quote: 'USD', rate: 1.1, asOf: '2026-03-01' }),
      rate({ base: 'USD', quote: 'EUR', rate: 0.95, asOf: '2026-03-10' }),
    ];

    expect(findRate(rates, 'EUR', 'USD', '2026-03-20')?.rate).toBe(1.1);
  });

  it('uses the most recent rate on or before the date', () => {
    const rates = [
      rate({ rate: 1.1, asOf: '2026-03-01' }),
      rate({ rate: 1.2, asOf: '2026-03-10' }),
    ];
    expect(findRate(rates, 'EUR', 'USD', '2026-03-15')?.rate).toBe(1.2);
  });

  it('never uses a rate from after the date', () => {
    // A future rate would restate yesterday's net worth overnight, with no
    // transaction having occurred.
    const rates = [
      rate({ rate: 1.1, asOf: '2026-03-01' }),
      rate({ rate: 9.9, asOf: '2026-04-01' }),
    ];
    expect(findRate(rates, 'EUR', 'USD', '2026-03-15')?.rate).toBe(1.1);
  });

  it('uses a rate dated exactly on the day', () => {
    expect(findRate([rate({ asOf: '2026-03-15' })], 'EUR', 'USD', '2026-03-15')?.rate).toBe(1.1);
  });

  it('returns null when nothing is on or before the date', () => {
    expect(findRate([rate({ asOf: '2026-04-01' })], 'EUR', 'USD', '2026-03-01')).toBeNull();
  });

  it('returns null for the same currency', () => {
    expect(findRate([rate()], 'USD', 'USD', '2026-03-01')).toBeNull();
  });

  it('is case-insensitive on currency codes', () => {
    expect(findRate([rate()], 'eur', 'usd', '2026-03-05')).not.toBeNull();
  });
});

describe('convert', () => {
  it('converts and rounds back to minor units', () => {
    const result = convert(10_000, 'EUR', 'USD', '2026-03-05', [rate()]);
    expect(result.amount).toBe(11_000);
    expect(Number.isInteger(result.amount)).toBe(true);
  });

  it('rounds rather than truncating', () => {
    const result = convert(333, 'EUR', 'USD', '2026-03-05', [rate({ rate: 1.5 })]);
    expect(result.amount).toBe(500);
  });

  it('is a no-op for the same currency', () => {
    const result = convert(10_000, 'USD', 'USD', '2026-03-05', []);
    expect(result.amount).toBe(10_000);
    expect(result.rate).toBe(1);
  });

  it('throws rather than returning zero when no rate exists', () => {
    // Zero, or the unconverted amount, would put a number on screen that looks
    // like money and is not.
    expect(() => convert(10_000, 'EUR', 'USD', '2026-03-05', [])).toThrow(NoRateAvailableError);
  });

  it('reports the rate, its date and its source', () => {
    const result = convert(10_000, 'EUR', 'USD', '2026-03-05', [
      rate({ source: 'statement', asOf: '2026-03-04' }),
    ]);

    expect(result.rateAsOf).toBe('2026-03-04');
    expect(result.source).toBe('statement');
  });

  it('flags a stale rate', () => {
    const result = convert(10_000, 'EUR', 'USD', '2026-03-20', [rate({ asOf: '2026-03-01' })]);
    expect(result.stale).toBe(true);
    expect(result.staleDays).toBe(19);
  });

  it('does not flag a recent rate as stale', () => {
    const result = convert(10_000, 'EUR', 'USD', '2026-03-05', [rate({ asOf: '2026-03-01' })]);
    expect(result.stale).toBe(false);
  });

  it('handles a negative amount', () => {
    expect(convert(-10_000, 'EUR', 'USD', '2026-03-05', [rate()]).amount).toBe(-11_000);
  });

  it('handles zero', () => {
    expect(convert(0, 'EUR', 'USD', '2026-03-05', [rate()]).amount).toBe(0);
  });
});

describe('combineTotals', () => {
  const totals = [
    { currency: 'USD', amount: 100_000 },
    { currency: 'EUR', amount: 50_000 },
  ];

  it('combines into the target currency', () => {
    const combined = combineTotals(totals, 'USD', '2026-03-05', [rate()]);

    expect(combined.amount).toBe(155_000);
    expect(combined.incomplete).toBe(false);
    expect(combined.ratesUsed).toHaveLength(1);
  });

  it('names a currency it could not convert instead of dropping it', () => {
    // A total that quietly omits an account is worse than one that admits it is
    // incomplete, because it looks finished.
    const combined = combineTotals(
      [...totals, { currency: 'JPY', amount: 500_000 }],
      'USD',
      '2026-03-05',
      [rate()],
    );

    expect(combined.missing).toEqual(['JPY']);
    expect(combined.incomplete).toBe(true);
    expect(combined.amount).toBe(155_000);
  });

  it('never assumes an unknown currency is 1:1', () => {
    const combined = combineTotals([{ currency: 'GBP', amount: 100_000 }], 'USD', '2026-03-05', []);
    expect(combined.amount).toBe(0);
    expect(combined.incomplete).toBe(true);
  });

  it('carries every rate relied on, so the figure can be audited', () => {
    const combined = combineTotals(totals, 'USD', '2026-03-20', [rate({ asOf: '2026-03-01' })]);

    expect(combined.ratesUsed[0]).toMatchObject({
      base: 'EUR',
      quote: 'USD',
      rate: 1.1,
      asOf: '2026-03-01',
      stale: true,
    });
  });

  it('needs no rate when everything is already in the target currency', () => {
    const combined = combineTotals([{ currency: 'USD', amount: 100_000 }], 'USD', '2026-03-05', []);
    expect(combined).toMatchObject({ amount: 100_000, incomplete: false });
  });

  it('is empty-safe', () => {
    expect(combineTotals([], 'USD', '2026-03-05', []).amount).toBe(0);
  });
});
