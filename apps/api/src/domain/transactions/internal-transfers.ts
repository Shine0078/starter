/**
 * Pairing money that moved between the user's own accounts.
 *
 * Moving $500 from chequing to savings produces two real transactions: a $500
 * outflow and a $500 inflow. Neither is income and neither is spending, but
 * nothing about either row says so on its own. Counted naively they inflate
 * expenses by $500, inflate income by $500, and leave the savings rate,
 * spending totals, category breakdown, and cash-flow forecast all wrong — with
 * no error anywhere, which is the failure mode this codebase keeps running into.
 *
 * The categoriser already excludes anything in a `transfer` category, but that
 * only fires when a descriptor happens to match the lexicon ("TRANSFER TO
 * SAVINGS"). Real banks are far less obliging: "e-Transfer", "ONLINE BANKING
 * PAYMENT", "WITHDRAWAL", or the merchant name of the receiving institution.
 * Descriptor matching cannot be the only defence.
 *
 * This pairs on the shape of the movement instead — equal and opposite amounts,
 * same currency, different accounts, close in time — which is what an internal
 * transfer actually looks like regardless of what the bank called it.
 */

import type { Transaction } from '../types';

export interface InternalTransferPair {
  /** The transaction money left. Always the negative side. */
  outflowId: string;
  /** The transaction money arrived in. Always the positive side. */
  inflowId: string;
  /** Absolute amount in minor units. */
  amount: number;
  currency: string;
  /** Whole days between the two postings. */
  daysApart: number;
}

export interface InternalTransferOptions {
  /**
   * How far apart the two sides may post.
   *
   * Three days by default. Interac and ACH commonly land a day or two after
   * they leave, and a weekend stretches that. Widening it further starts
   * pairing genuinely unrelated transactions that happen to share an amount,
   * which is the expensive mistake in the other direction: hiding a real
   * expense and a real deposit from the user.
   */
  windowDays?: number;
}

const DEFAULT_WINDOW_DAYS = 3;
const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` to a UTC timestamp. Dates are dates here, never local times. */
function dayValue(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(dayValue(a) - dayValue(b)) / MS_PER_DAY;
}

/**
 * Finds transfers between accounts the user owns.
 *
 * Every transaction passed in is assumed to belong to one user — the stores are
 * scoped that way — so "the user's own accounts" is simply "any two different
 * accounts in this set".
 *
 * Matching is deterministic: candidates are considered oldest-first, and each
 * outflow takes the closest eligible inflow. Two identical transfers on the
 * same day therefore pair with each other rather than crossing over, and the
 * result does not depend on the order rows came back from the database.
 *
 * A transaction is never paired twice. Given three $500 movements and only two
 * counterparties, one is left alone — under-detecting is the safer error,
 * because a missed transfer overstates spending in a way the user can see and
 * correct, while a false pair silently deletes a real expense from their
 * totals.
 */
export function detectInternalTransfers(
  transactions: readonly Transaction[],
  options: InternalTransferOptions = {},
): InternalTransferPair[] {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;

  const outflows: Transaction[] = [];
  const inflows: Transaction[] = [];

  for (const txn of transactions) {
    // A pending row can post later with a different date or amount, and pairing
    // against one produces a match that quietly stops being true.
    if (txn.pending) continue;
    if (txn.amount < 0) outflows.push(txn);
    else if (txn.amount > 0) inflows.push(txn);
    // Zero-amount rows are not a movement of money.
  }

  const byDateThenId = (a: Transaction, b: Transaction): number =>
    a.postedAt === b.postedAt ? a.id.localeCompare(b.id) : a.postedAt.localeCompare(b.postedAt);

  outflows.sort(byDateThenId);
  inflows.sort(byDateThenId);

  const claimed = new Set<string>();
  const pairs: InternalTransferPair[] = [];

  for (const outflow of outflows) {
    const amount = Math.abs(outflow.amount);

    let best: Transaction | null = null;
    let bestDays = Number.POSITIVE_INFINITY;

    for (const inflow of inflows) {
      if (claimed.has(inflow.id)) continue;

      // The other side of the same movement, not merely a similar one.
      if (inflow.amount !== amount) continue;
      if (inflow.currency !== outflow.currency) continue;

      // Same account cannot be a transfer to itself. This also rules out a
      // refund, which lands back in the account it left.
      if (inflow.accountId === outflow.accountId) continue;

      const gap = daysBetween(outflow.postedAt, inflow.postedAt);
      if (gap > windowDays) continue;

      if (gap < bestDays) {
        best = inflow;
        bestDays = gap;
      }
      // Same-day is as close as it gets; stop looking.
      if (bestDays === 0) break;
    }

    if (!best) continue;

    claimed.add(best.id);
    claimed.add(outflow.id);
    pairs.push({
      outflowId: outflow.id,
      inflowId: best.id,
      amount,
      currency: outflow.currency,
      daysApart: bestDays,
    });
  }

  return pairs;
}

/**
 * Ids on either side of a detected transfer, for excluding from analytics.
 */
export function internalTransferIds(pairs: readonly InternalTransferPair[]): Set<string> {
  const ids = new Set<string>();
  for (const pair of pairs) {
    ids.add(pair.outflowId);
    ids.add(pair.inflowId);
  }
  return ids;
}

/** True when the user has already said what this is; never override that. */
export function isUserCategorised(txn: Transaction): boolean {
  return txn.categorySource === 'user_manual' || txn.categorySource === 'user_rule';
}
