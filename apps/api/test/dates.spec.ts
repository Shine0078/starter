import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  comparablePreviousRange,
  daysBetweenInclusive,
  endOfMonth,
  isWithin,
  monthToDateRange,
  previousMonthRange,
  weekRange,
} from '../src/domain/dates';

describe('addMonths', () => {
  it('clamps to the shorter month instead of overflowing', () => {
    // Naive date math turns Jan 31 + 1 month into Mar 3.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('crosses a year boundary', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });
});

describe('daysBetweenInclusive', () => {
  it('counts a single day as one', () => {
    expect(daysBetweenInclusive('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('counts a full month', () => {
    expect(daysBetweenInclusive('2026-08-01', '2026-08-31')).toBe(31);
  });

  it('is unaffected by daylight saving transitions', () => {
    // US DST ends 2026-11-01. A local-time implementation returns 8 here.
    expect(daysBetweenInclusive('2026-10-28', '2026-11-04')).toBe(8);
  });
});

describe('range helpers', () => {
  it('finds the end of a month', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('builds an ISO week starting Monday', () => {
    // 2026-08-07 is a Friday.
    expect(weekRange('2026-08-07')).toEqual({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('treats range ends as inclusive', () => {
    const range = { start: '2026-08-01', end: '2026-08-31' };
    expect(isWithin('2026-08-31', range)).toBe(true);
    expect(isWithin('2026-09-01', range)).toBe(false);
  });

  it('runs month-to-date from the first through today', () => {
    expect(monthToDateRange('2026-08-07')).toEqual({ start: '2026-08-01', end: '2026-08-07' });
  });
});

describe('comparablePreviousRange', () => {
  it('truncates last month to the same elapsed length', () => {
    // Otherwise 7 days of August against 31 days of July reports every category
    // as "down", which is a calendar artifact rather than an insight.
    expect(comparablePreviousRange('2026-08-07')).toEqual({
      start: '2026-07-01',
      end: '2026-07-07',
    });
  });

  it('clamps when the previous month is shorter', () => {
    expect(comparablePreviousRange('2026-03-31')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('never extends past the previous month', () => {
    const range = comparablePreviousRange('2026-08-31');
    expect(range.end).toBe('2026-07-31');
    expect(range.end <= previousMonthRange('2026-08-31').end).toBe(true);
  });
});

describe('addDays', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
});
