import { CATEGORIES } from '../categories';
import type { DateRange } from '../types';

export interface InterpretedTransactionQuery {
  categorySlug?: string;
  range?: DateRange;
  search?: string;
  pending?: boolean;
  recurring?: boolean;
  amountMin?: number;
  amountMax?: number;
}

export interface NaturalTransactionSearch {
  query: InterpretedTransactionQuery;
  explanation: string | null;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Deterministic, privacy-preserving interpretation for common transaction
 * searches. Unrecognised words remain merchant/description search text; no
 * transaction data or query text leaves FINVERSE.
 */
export function interpretTransactionSearch(
  input: string,
  today: string,
): NaturalTransactionSearch {
  let remaining = input.trim();
  const query: InterpretedTransactionQuery = {};
  const explained: string[] = [];

  const consume = (pattern: RegExp): RegExpMatchArray | null => {
    const match = pattern.exec(remaining);
    if (!match) return null;
    remaining = `${remaining.slice(0, match.index)} ${remaining.slice(match.index + match[0].length)}`;
    return match;
  };

  const todayDate = parseIsoDate(today);
  const relativeDates: Array<[RegExp, string, string, string]> = [
    [/\blast month\b/i, ...monthRange(addMonths(todayDate, -1)), 'last month'],
    [/\bthis month\b/i, ...monthToDate(todayDate), 'this month'],
    [/\byesterday\b/i, iso(addDays(todayDate, -1)), iso(addDays(todayDate, -1)), 'yesterday'],
    [/\btoday\b/i, today, today, 'today'],
  ];
  for (const [pattern, start, end, label] of relativeDates) {
    if (consume(pattern)) {
      query.range = { start, end };
      explained.push(label);
      break;
    }
  }

  if (!query.range) {
    const monthPattern = new RegExp(`\\b(${MONTHS.join('|')})(?:\\s+(20\\d{2}))?\\b`, 'i');
    const match = consume(monthPattern);
    if (match) {
      const month = MONTHS.indexOf(match[1]!.toLowerCase());
      let year = match[2] ? Number(match[2]) : todayDate.getUTCFullYear();
      if (!match[2] && month > todayDate.getUTCMonth()) year -= 1;
      const date = new Date(Date.UTC(year, month, 1));
      const [start, end] = monthRange(date);
      query.range = { start, end };
      explained.push(`${MONTHS[month]} ${year}`);
    }
  }

  const lowerBound = consume(/\b(over|more than|above|at least)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i);
  if (lowerBound) {
    const amount = toMinorUnits(lowerBound[2]!);
    query.amountMin = lowerBound[1]!.toLowerCase() === 'at least' ? amount : amount + 1;
    explained.push(`amount ${lowerBound[1]!.toLowerCase()} ${formatPlainAmount(amount)}`);
  }
  const upperBound = consume(/\b(under|less than|below|at most)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/i);
  if (upperBound) {
    const amount = toMinorUnits(upperBound[2]!);
    query.amountMax = upperBound[1]!.toLowerCase() === 'at most' ? amount : Math.max(0, amount - 1);
    explained.push(`amount ${upperBound[1]!.toLowerCase()} ${formatPlainAmount(amount)}`);
  }
  if (query.amountMin === undefined && query.amountMax === undefined) {
    const exact = consume(/(?:\bexactly\s*)?\$\s*(\d+(?:\.\d{1,2})?)\b/i);
    if (exact) {
      const amount = toMinorUnits(exact[1]!);
      query.amountMin = amount;
      query.amountMax = amount;
      explained.push(`amount exactly ${formatPlainAmount(amount)}`);
    }
  }

  if (consume(/\bpending\b/i)) {
    query.pending = true;
    explained.push('pending only');
  } else if (consume(/\b(?:posted|settled)\b/i)) {
    query.pending = false;
    explained.push('posted only');
  }
  if (consume(/\brecurring\b/i)) {
    query.recurring = true;
    explained.push('recurring only');
  }

  const categoryAliases = [
    ...CATEGORIES.map((category) => ({
      phrase: category.name.toLowerCase(),
      slug: category.slug,
      name: category.name,
    })),
    { phrase: 'gas', slug: 'fuel', name: 'Fuel' },
    { phrase: 'restaurant', slug: 'restaurants', name: 'Restaurants' },
  ].sort((left, right) => right.phrase.length - left.phrase.length);
  for (const category of categoryAliases) {
    const pattern = new RegExp(`\\b${escapeRegExp(category.phrase).replaceAll('\\ ', '\\s+')}\\b`, 'i');
    if (consume(pattern)) {
      query.categorySlug = category.slug;
      explained.push(`category ${category.name}`);
      break;
    }
  }

  remaining = remaining
    .replace(/\b(show|find|list|me|all|transactions?|purchases?|spending|expenses?|from|during|in|for|and)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (remaining) {
    query.search = remaining;
    if (explained.length > 0) explained.push(`matching “${remaining}”`);
  }

  if (explained.length === 0) return { query: { search: input.trim() }, explanation: null };
  return {
    query,
    explanation: `Interpreted as ${explained.join(', ')}.`,
  };
}

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('today must be YYYY-MM-DD');
  return date;
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

function addMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function monthRange(value: Date): [string, string] {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  return [iso(start), iso(end)];
}

function monthToDate(value: Date): [string, string] {
  return [iso(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))), iso(value)];
}

function toMinorUnits(value: string): number {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function formatPlainAmount(minorUnits: number): string {
  return `$${(minorUnits / 100).toFixed(2)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
