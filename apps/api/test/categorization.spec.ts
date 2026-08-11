import { describe, expect, it } from 'vitest';

import {
  categorizeDescriptor,
  coverageRate,
  ruleFromCorrection,
} from '../src/domain/categorization/categorize';
import { normalizeDescriptor } from '../src/domain/categorization/normalize';
import type { CategorizationRule } from '../src/domain/types';

describe('normalizeDescriptor', () => {
  it.each([
    ['SQ *BLUE BOTTLE 0093 SAN FRAN CA', 'blue bottle san fran'],
    ['AMZN Mktp US*2K4L9RT21', 'amzn mktp us'],
    ['TST* SWEETGREEN 1042', 'sweetgreen'],
    ['SHELL OIL 574812 TX', 'shell oil'],
    ['POS DEBIT WHOLE FOODS MKT 10241', 'whole foods mkt'],
    ['NETFLIX.COM 8887638', 'netflix com'],
    ['PAYPAL *SPOTIFY USA', 'spotify usa'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeDescriptor(raw)).toBe(expected);
  });

  it('strips branch numbers so a rule matches the merchant, not one store', () => {
    // The tier-1 guarantee depends on this: a rule built from one visit has to
    // match the next visit to a different branch.
    expect(normalizeDescriptor('CHIPOTLE 2984 SAN JOSE CA')).toBe(
      normalizeDescriptor('CHIPOTLE 1177 SAN JOSE CA'),
    );
  });

  it('keeps single digits that are part of a name', () => {
    expect(normalizeDescriptor('7 ELEVEN 22194')).toBe('7 eleven');
  });

  it('is idempotent', () => {
    const once = normalizeDescriptor('SQ *BLUE BOTTLE 0093 SAN FRAN CA');
    expect(normalizeDescriptor(once)).toBe(once);
  });
});

describe('categorizeDescriptor', () => {
  it('falls back to unknown rather than guessing', () => {
    const result = categorizeDescriptor('HARBOUR LANE BOOKSHOP');
    expect(result.categorySlug).toBe('unknown');
    expect(result.source).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('matches the lexicon', () => {
    const result = categorizeDescriptor('STARBUCKS STORE 04412 SEATTLE WA');
    expect(result.categorySlug).toBe('coffee');
    expect(result.source).toBe('lexicon');
    expect(result.merchant).toBe('Starbucks');
  });

  it('prefers the more specific lexicon entry', () => {
    // "uber eats" must beat "uber", or every food delivery becomes a taxi ride.
    expect(categorizeDescriptor('UBER EATS 8005928').categorySlug).toBe('food_delivery');
    expect(categorizeDescriptor('UBER *TRIP HELP.UBER.COM').categorySlug).toBe('rideshare');
    expect(categorizeDescriptor('SHELL OIL 574812 TX').categorySlug).toBe('fuel');
  });

  it('covers major subscriptions, merchants, and bills', () => {
    expect(categorizeDescriptor('NETFLIX.COM 8887638').categorySlug).toBe('streaming');
    expect(categorizeDescriptor('PARAMOUNT PLUS').categorySlug).toBe('streaming');
    expect(categorizeDescriptor('PEACOCK TV').categorySlug).toBe('streaming');
    expect(categorizeDescriptor('CHATGPT SUBSCRIPTION').categorySlug).toBe('software');
    expect(categorizeDescriptor('XBOX GAME PASS').categorySlug).toBe('gaming');
    expect(categorizeDescriptor('CHICK-FIL-A #04281').categorySlug).toBe('fast_food');
    expect(categorizeDescriptor('INSTACART 800-000').categorySlug).toBe('food_delivery');
    expect(categorizeDescriptor('EXXONMOBIL #5-1384').categorySlug).toBe('fuel');
    expect(categorizeDescriptor('GEICO PAYMENT').categorySlug).toBe('insurance');
    expect(categorizeDescriptor('AIR CANADA TICKET').categorySlug).toBe('travel');
    expect(categorizeDescriptor('DUKE ENERGY BILL PAY').categorySlug).toBe('utilities');
    expect(categorizeDescriptor('WEALTHSIMPLE').categorySlug).toBe('investments');
  });

  it('lets a user rule beat a confident lexicon match', () => {
    const rules: CategorizationRule[] = [
      { id: 'r1', matchType: 'contains', pattern: 'starbucks', categorySlug: 'entertainment', priority: 0 },
    ];
    const result = categorizeDescriptor('STARBUCKS STORE 04412 SEATTLE WA', { rules });
    expect(result.categorySlug).toBe('entertainment');
    expect(result.source).toBe('user_rule');
    expect(result.confidence).toBe(1);
  });

  it('breaks ties between rules by priority', () => {
    const rules: CategorizationRule[] = [
      { id: 'low', matchType: 'contains', pattern: 'amzn', categorySlug: 'electronics', priority: 5 },
      { id: 'high', matchType: 'contains', pattern: 'amzn', categorySlug: 'clothing', priority: 1 },
    ];
    expect(categorizeDescriptor('AMZN Mktp US*2K4', { rules }).categorySlug).toBe('clothing');
  });

  it('survives a malformed user regex instead of failing the whole batch', () => {
    const rules: CategorizationRule[] = [
      { id: 'bad', matchType: 'regex', pattern: '([unclosed', categorySlug: 'shopping', priority: 0 },
    ];
    expect(() => categorizeDescriptor('NETFLIX.COM 8887638', { rules })).not.toThrow();
    expect(categorizeDescriptor('NETFLIX.COM 8887638', { rules }).categorySlug).toBe('streaming');
  });

  it('ignores a model prediction below the confidence floor', () => {
    const model = { classify: () => ({ categorySlug: 'travel', confidence: 0.4 }) };
    expect(categorizeDescriptor('HARBOUR LANE BOOKSHOP', { model }).categorySlug).toBe('unknown');
  });

  it('accepts a model prediction above the floor', () => {
    const model = { classify: () => ({ categorySlug: 'travel', confidence: 0.85 }) };
    const result = categorizeDescriptor('HARBOUR LANE BOOKSHOP', { model });
    expect(result.categorySlug).toBe('travel');
    expect(result.source).toBe('model');
  });

  it('always explains itself', () => {
    for (const descriptor of ['NETFLIX.COM 8887638', 'HARBOUR LANE BOOKSHOP']) {
      expect(categorizeDescriptor(descriptor).reason.length).toBeGreaterThan(0);
    }
  });
});

describe('ruleFromCorrection', () => {
  it('produces a rule that matches other branches of the same merchant', () => {
    const rule = ruleFromCorrection('KOZY KORNER DINER 88', 'restaurants', 'r1');
    expect(rule.pattern).toBe('kozy korner diner');

    const result = categorizeDescriptor('KOZY KORNER DINER 91', { rules: [rule] });
    expect(result.categorySlug).toBe('restaurants');
    expect(result.source).toBe('user_rule');
  });
});

describe('coverageRate', () => {
  it('is zero for an empty set rather than NaN', () => {
    expect(coverageRate([])).toBe(0);
  });

  it('measures the share we could categorize', () => {
    const results = ['NETFLIX.COM 1', 'SPOTIFY 2', 'HARBOUR LANE BOOKSHOP', 'MYSTERY VENDOR'].map(
      (d) => categorizeDescriptor(d),
    );
    expect(coverageRate(results)).toBe(0.5);
  });
});
