/**
 * Saved transaction views.
 *
 * A view is a named `TransactionQuery`, nothing more. Keeping it that way is
 * the whole design: applying a view hands its fields straight back to the same
 * store method the transaction list already uses, so there is exactly one
 * implementation of filtering and a saved view cannot drift from a live one.
 */

import type { TransactionQuery } from '../../ports';

export interface SavedView {
  id: string;
  name: string;
  /** Absent fields mean "do not constrain". */
  filter: SavedViewFilter;
  createdAt: string;
}

/**
 * The persistable subset of TransactionQuery.
 *
 * `before` and `limit` are deliberately excluded — they are pagination, not
 * filter intent, and freezing a cursor into a saved view would pin it to a
 * page that stops existing.
 */
export interface SavedViewFilter {
  search?: string;
  categorySlug?: string;
  categoryKind?: 'expense' | 'income' | 'transfer' | 'special';
  accountId?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  pending?: boolean;
  recurring?: boolean;
}

export const MAX_VIEW_NAME_LENGTH = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORY_KINDS = ['expense', 'income', 'transfer', 'special'] as const;

export interface ViewValidation {
  ok: boolean;
  problems: string[];
}

export function normalizeViewName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Validates filter intent.
 *
 * Every problem is returned at once rather than the first one, because a user
 * correcting a filter one rejection at a time gives up before they finish.
 */
export function validateFilter(filter: SavedViewFilter): ViewValidation {
  const problems: string[] = [];

  for (const [field, value] of [
    ['dateFrom', filter.dateFrom],
    ['dateTo', filter.dateTo],
  ] as const) {
    if (value !== undefined && !ISO_DATE.test(value)) {
      problems.push(`${field} must be a calendar date (YYYY-MM-DD).`);
    }
  }

  if (filter.dateFrom && filter.dateTo && filter.dateFrom > filter.dateTo) {
    problems.push('dateFrom must not be after dateTo.');
  }

  for (const [field, value] of [
    ['amountMin', filter.amountMin],
    ['amountMax', filter.amountMax],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      problems.push(`${field} must be a whole, non-negative number of minor units.`);
    }
  }

  if (
    filter.amountMin !== undefined &&
    filter.amountMax !== undefined &&
    filter.amountMin > filter.amountMax
  ) {
    problems.push('amountMin must not be above amountMax.');
  }

  if (
    filter.categoryKind !== undefined &&
    !CATEGORY_KINDS.includes(filter.categoryKind)
  ) {
    problems.push(`categoryKind must be one of: ${CATEGORY_KINDS.join(', ')}.`);
  }

  return { ok: problems.length === 0, problems };
}

export function validateName(name: string): ViewValidation {
  const normalized = normalizeViewName(name);
  const problems: string[] = [];

  if (normalized.length === 0) problems.push('Give the view a name.');
  if (normalized.length > MAX_VIEW_NAME_LENGTH) {
    problems.push(`Use ${MAX_VIEW_NAME_LENGTH} characters or fewer.`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Turns a saved view into the query the transaction store already understands.
 *
 * `limit` is supplied by the caller, not the view, so the same view works for a
 * preview of five rows and a full page.
 */
export function toTransactionQuery(filter: SavedViewFilter, limit?: number): TransactionQuery {
  const query: TransactionQuery = {};

  if (filter.search) query.search = filter.search;
  if (filter.categorySlug) query.categorySlug = filter.categorySlug;
  if (filter.categoryKind) query.categoryKind = filter.categoryKind;
  if (filter.accountId) query.accountId = filter.accountId;
  if (filter.tag) query.tag = filter.tag;
  if (filter.amountMin !== undefined) query.amountMin = filter.amountMin;
  if (filter.amountMax !== undefined) query.amountMax = filter.amountMax;
  if (filter.pending !== undefined) query.pending = filter.pending;
  if (filter.recurring !== undefined) query.recurring = filter.recurring;

  // A one-sided date bound still has to become a closed range for the store,
  // so the open end is widened rather than dropped — dropping it would quietly
  // turn "everything since March" into "everything".
  if (filter.dateFrom || filter.dateTo) {
    query.range = {
      start: filter.dateFrom ?? '0001-01-01',
      end: filter.dateTo ?? '9999-12-31',
    };
  }

  if (limit !== undefined) query.limit = limit;

  return query;
}

/** True when the view constrains nothing — worth telling the user before they save it. */
export function isEmptyFilter(filter: SavedViewFilter): boolean {
  return Object.values(filter).every((value) => value === undefined || value === '');
}
