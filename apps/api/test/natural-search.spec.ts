import { describe, expect, it } from 'vitest';

import { interpretTransactionSearch } from '../src/domain/transactions/natural-search';

describe('natural transaction search', () => {
  it('combines merchant, amount, category, and relative date without guessing', () => {
    expect(
      interpretTransactionSearch('Show Starbucks coffee over $20 last month', '2026-08-15'),
    ).toEqual({
      query: {
        search: 'Starbucks',
        categorySlug: 'coffee',
        amountMin: 2001,
        range: { start: '2026-07-01', end: '2026-07-31' },
      },
      explanation:
        'Interpreted as last month, amount over $20.00, category Coffee, matching “Starbucks”.',
    });
  });

  it('resolves a month without a year to the most recent occurrence', () => {
    expect(interpretTransactionSearch('groceries in December', '2026-08-15').query).toEqual({
      categorySlug: 'groceries',
      range: { start: '2025-12-01', end: '2025-12-31' },
    });
  });

  it('supports exact amounts, pending, and recurring status', () => {
    expect(interpretTransactionSearch('pending recurring exactly $18.99', '2026-08-15').query)
      .toEqual({ pending: true, recurring: true, amountMin: 1899, amountMax: 1899 });
  });

  it('keeps an ordinary merchant query unchanged', () => {
    expect(interpretTransactionSearch("McDonald's", '2026-08-15')).toEqual({
      query: { search: "McDonald's" },
      explanation: null,
    });
  });
});
