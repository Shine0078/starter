import { describe, expect, it } from 'vitest';

import {
  isEmptyFilter,
  normalizeViewName,
  toTransactionQuery,
  validateFilter,
  validateName,
  type SavedViewFilter,
} from '../src/domain/transactions/saved-view';

describe('view names', () => {
  it('collapses whitespace so two views cannot look identical', () => {
    expect(normalizeViewName('  Coffee   spending ')).toBe('Coffee spending');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });

  it('rejects an overlong name', () => {
    expect(validateName('a'.repeat(61)).ok).toBe(false);
    expect(validateName('a'.repeat(60)).ok).toBe(true);
  });
});

describe('filter validation', () => {
  it('accepts an empty filter', () => {
    expect(validateFilter({}).ok).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(validateFilter({ dateFrom: '01/03/2026' }).ok).toBe(false);
  });

  it('rejects an inverted date range', () => {
    // Matches nothing, so it is always a mistake rather than an intent.
    const result = validateFilter({ dateFrom: '2026-08-31', dateTo: '2026-08-01' });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/dateFrom must not be after/);
  });

  it('accepts a single-day range', () => {
    expect(validateFilter({ dateFrom: '2026-08-01', dateTo: '2026-08-01' }).ok).toBe(true);
  });

  it('rejects an inverted amount range', () => {
    expect(validateFilter({ amountMin: 5_000, amountMax: 1_000 }).ok).toBe(false);
  });

  it('rejects fractional and negative amounts', () => {
    expect(validateFilter({ amountMin: 10.5 }).ok).toBe(false);
    expect(validateFilter({ amountMin: -1 }).ok).toBe(false);
  });

  it('accepts a zero lower bound', () => {
    expect(validateFilter({ amountMin: 0 }).ok).toBe(true);
  });

  it('rejects an unknown category kind', () => {
    expect(
      validateFilter({ categoryKind: 'wishful' as SavedViewFilter['categoryKind'] }).ok,
    ).toBe(false);
  });

  it('reports every problem at once', () => {
    // One rejection at a time is how a user gives up before finishing.
    const result = validateFilter({
      dateFrom: 'nope',
      amountMin: -5,
      categoryKind: 'bad' as SavedViewFilter['categoryKind'],
    });
    expect(result.problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('toTransactionQuery', () => {
  it('omits absent fields rather than sending undefined constraints', () => {
    expect(toTransactionQuery({})).toEqual({});
  });

  it('passes filters straight through to the existing query contract', () => {
    const query = toTransactionQuery({
      search: 'coffee',
      categorySlug: 'coffee',
      accountId: 'acc_credit',
      tag: 'work',
      amountMin: 100,
      amountMax: 5_000,
      pending: false,
      recurring: true,
    });

    expect(query).toEqual({
      search: 'coffee',
      categorySlug: 'coffee',
      accountId: 'acc_credit',
      tag: 'work',
      amountMin: 100,
      amountMax: 5_000,
      pending: false,
      recurring: true,
    });
  });

  it('widens a one-sided date bound instead of dropping it', () => {
    // Dropping the open end would turn "everything since March" into
    // "everything", which is a different and much larger answer.
    expect(toTransactionQuery({ dateFrom: '2026-03-01' }).range).toEqual({
      start: '2026-03-01',
      end: '9999-12-31',
    });

    expect(toTransactionQuery({ dateTo: '2026-03-31' }).range).toEqual({
      start: '0001-01-01',
      end: '2026-03-31',
    });
  });

  it('preserves a closed date range', () => {
    expect(toTransactionQuery({ dateFrom: '2026-03-01', dateTo: '2026-03-31' }).range).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  it('keeps false as a real constraint', () => {
    // `pending: false` means "settled only" and must not be treated as absent.
    expect(toTransactionQuery({ pending: false })).toHaveProperty('pending', false);
    expect(toTransactionQuery({ recurring: false })).toHaveProperty('recurring', false);
  });

  it('takes limit from the caller, not the view', () => {
    // The same view serves a five-row preview and a full page.
    expect(toTransactionQuery({ search: 'x' }, 5).limit).toBe(5);
    expect(toTransactionQuery({ search: 'x' }).limit).toBeUndefined();
  });
});

describe('isEmptyFilter', () => {
  it('detects a view that constrains nothing', () => {
    expect(isEmptyFilter({})).toBe(true);
    expect(isEmptyFilter({ search: '' })).toBe(true);
  });

  it('does not call a false constraint empty', () => {
    expect(isEmptyFilter({ pending: false })).toBe(false);
  });

  it('detects a real filter', () => {
    expect(isEmptyFilter({ tag: 'work' })).toBe(false);
  });
});
