/**
 * Historical balance derivation and reconciliation arithmetic.
 *
 * Pure: no store, no clock, no framework. Every input is passed in, which is
 * what makes the month-boundary and sign cases below testable exhaustively.
 */

import { formatMoney, money } from '../money';
import type { Account, Transaction } from '../types';
import type { ReconciliationOutcome, ReconciliationStatus } from './types';

export class CurrencyMismatchError extends Error {
  constructor(accountCurrency: string, assertedCurrency: string) {
    super(
      `Account is held in ${accountCurrency} but the balance was asserted in ` +
        `${assertedCurrency}. Converting it here would invent an exchange rate.`,
    );
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * The account's balance at the end of `asOf`, derived by unwinding everything
 * that has posted since.
 *
 * The provider gives us one balance — the balance *now*. Every historical
 * balance is therefore reconstructed rather than stored, by subtracting the
 * transactions that landed after the date in question.
 *
 * **Pending rows are excluded on purpose.** Aggregators report `current` as the
 * posted balance and hold pending activity separately (Plaid's `available`
 * reflects it, `current` does not). Since `balanceCurrent` never included those
 * amounts, unwinding them would remove money that was never there and produce a
 * difference that does not exist.
 */
export function computeBalanceAsOf(
  account: Account,
  transactions: readonly Transaction[],
  asOf: string,
): { balance: number; transactionsConsidered: number } {
  let posted = 0;
  let considered = 0;

  for (const txn of transactions) {
    if (txn.accountId !== account.id) continue;
    if (txn.pending) continue;
    // Strictly after: a transaction on the statement date itself is part of the
    // closing balance the user is looking at, not something to unwind.
    if (txn.postedAt <= asOf) continue;

    posted += txn.amount;
    considered += 1;
  }

  return { balance: account.balanceCurrent - posted, transactionsConsidered: considered };
}

function describe(
  status: ReconciliationStatus,
  difference: number,
  currency: string,
  asOf: string,
): string {
  if (status === 'balanced') {
    return `Your records agree with the account balance on ${asOf}.`;
  }

  // Sign is stated in the user's terms rather than as a raw delta: "we are
  // missing money" and "we have money you did not record" are different
  // investigations.
  const magnitude = formatMoney(money(Math.abs(difference), currency));

  return difference > 0
    ? `The account holds ${magnitude} more than FINVERSE recorded on ${asOf}. ` +
        'A deposit or refund may be missing.'
    : `FINVERSE recorded ${magnitude} more than the account held on ${asOf}. ` +
        'A payment may be duplicated, or one may not have cleared.';
}

/**
 * Compares an observed balance against the derived one.
 *
 * Throws on a currency mismatch rather than converting. There is no rate here,
 * and inventing one would turn an accounting check into a guess.
 */
export function reconcile(
  account: Account,
  transactions: readonly Transaction[],
  asOf: string,
  observedBalance: number,
  assertedCurrency: string,
): ReconciliationOutcome {
  if (assertedCurrency.toUpperCase() !== account.currency.toUpperCase()) {
    throw new CurrencyMismatchError(account.currency, assertedCurrency);
  }

  const { balance, transactionsConsidered } = computeBalanceAsOf(account, transactions, asOf);
  const difference = observedBalance - balance;
  const status: ReconciliationStatus = difference === 0 ? 'balanced' : 'unbalanced';

  return {
    computedBalance: balance,
    difference,
    status,
    transactionsConsidered,
    explanation: describe(status, difference, account.currency, asOf),
  };
}

/**
 * The most recent non-archived assertion per account.
 *
 * Drives the "last reconciled" indicator: an account nobody has checked in
 * months is exactly where an unnoticed error accumulates.
 */
export function latestPerAccount<T extends { accountId: string; statementDate: string; archivedAt: string | null }>(
  reconciliations: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();

  for (const row of reconciliations) {
    if (row.archivedAt !== null) continue;
    const existing = latest.get(row.accountId);
    if (!existing || row.statementDate > existing.statementDate) {
      latest.set(row.accountId, row);
    }
  }

  return latest;
}

/** Whole days between the last assertion and today; null when never reconciled. */
export function daysSinceReconciled(
  latestStatementDate: string | undefined,
  today: string,
): number | null {
  if (!latestStatementDate) return null;
  const from = Date.parse(`${latestStatementDate}T00:00:00.000Z`);
  const to = Date.parse(`${today}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
