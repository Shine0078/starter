import { describe, expect, it } from 'vitest';

import {
  CurrencyMismatchError,
  addMoney,
  allocate,
  exponentOf,
  formatMoney,
  majorToMinor,
  minorToMajor,
  money,
  percentOf,
  subtractMoney,
  sumMoney,
} from '../src/domain/money';

describe('money', () => {
  it('rejects non-integer amounts', () => {
    expect(() => money(12.34)).toThrow(TypeError);
  });

  it('is exact where floats are not', () => {
    // The canonical float failure: 0.1 + 0.2 !== 0.3
    const total = addMoney(money(10), money(20));
    expect(total.amount).toBe(30);
  });

  it('refuses to add different currencies', () => {
    expect(() => addMoney(money(100, 'USD'), money(100, 'EUR'))).toThrow(CurrencyMismatchError);
  });

  it('sums an empty list to a typed zero', () => {
    expect(sumMoney([], 'GBP')).toEqual({ amount: 0, currency: 'GBP' });
  });

  it('subtracts', () => {
    expect(subtractMoney(money(500), money(150)).amount).toBe(350);
  });

  it('uppercases the currency code', () => {
    expect(money(1, 'usd').currency).toBe('USD');
  });

  describe('minor unit exponents', () => {
    it('defaults to 2', () => {
      expect(exponentOf('USD')).toBe(2);
      expect(exponentOf('XYZ')).toBe(2);
    });

    it('knows zero-decimal currencies', () => {
      expect(exponentOf('JPY')).toBe(0);
      expect(majorToMinor(1500, 'JPY')).toBe(1500);
      expect(minorToMajor(1500, 'JPY')).toBe(1500);
    });

    it('knows three-decimal currencies', () => {
      expect(exponentOf('KWD')).toBe(3);
      expect(majorToMinor(1.5, 'KWD')).toBe(1500);
    });
  });

  describe('majorToMinor', () => {
    it('rounds half away from zero, symmetrically', () => {
      expect(majorToMinor(12.345)).toBe(1235);
      expect(majorToMinor(-12.345)).toBe(-1235);
    });

    it('survives values that are not exactly representable', () => {
      expect(majorToMinor(0.1 + 0.2)).toBe(30);
      expect(majorToMinor(19.99)).toBe(1999);
      expect(majorToMinor(1.005)).toBe(101);
    });
  });

  describe('allocate', () => {
    it('distributes remainder cents so the parts sum back exactly', () => {
      const parts = allocate(money(1000), 3);
      expect(parts.map((p) => p.amount)).toEqual([334, 333, 333]);
      expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1000);
    });

    it('preserves sign', () => {
      const parts = allocate(money(-1000), 3);
      expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(-1000);
      expect(parts.every((p) => p.amount < 0)).toBe(true);
    });

    it('handles an exact division', () => {
      expect(allocate(money(900), 3).map((p) => p.amount)).toEqual([300, 300, 300]);
    });

    it('rejects a non-positive part count', () => {
      expect(() => allocate(money(100), 0)).toThrow(RangeError);
    });
  });

  describe('percentOf', () => {
    it('guards divide-by-zero rather than returning NaN', () => {
      expect(percentOf(100, 0)).toBe(0);
    });

    it('computes a percentage', () => {
      expect(percentOf(25, 200)).toBe(12.5);
    });
  });

  it('formats for display', () => {
    expect(formatMoney(money(123_456, 'USD'))).toBe('$1,234.56');
    expect(formatMoney(money(-450, 'USD'))).toBe('-$4.50');
  });
});
