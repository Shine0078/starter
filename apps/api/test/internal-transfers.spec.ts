/**
 * Internal transfer detection.
 *
 * The bug this prevents is silent in both directions, which is why the tests
 * push on both. Miss a transfer and the user's expenses and income are each
 * overstated by the same amount. Invent one and a real expense vanishes from
 * their totals with nothing to show it ever existed.
 */

import { describe, expect, it } from 'vitest';

import {
  detectInternalTransfers,
  internalTransferIds,
} from '../src/domain/transactions/internal-transfers';
import type { Transaction } from '../src/domain/types';

function txn(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    accountId: 'acc_checking',
    providerTxnId: overrides.id,
    postedAt: '2026-08-10',
    amount: -50_000,
    currency: 'CAD',
    rawDescriptor: 'TRANSFER',
    normalizedDescriptor: 'transfer',
    categorySlug: 'unknown',
    categorySource: 'lexicon',
    categoryConfidence: 0.5,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

describe('detectInternalTransfers', () => {
  it('pairs money leaving one account and arriving in another', () => {
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -50_000 }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 50_000 }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ outflowId: 'out', inflowId: 'in', amount: 50_000 });
  });

  it('pairs regardless of what the bank called it', () => {
    // The whole reason this exists. Descriptor matching in the lexicon only
    // catches obliging strings like "TRANSFER TO SAVINGS"; real banks send
    // "e-Transfer", "WITHDRAWAL", or the receiving institution's name.
    const pairs = detectInternalTransfers([
      txn({
        id: 'out',
        accountId: 'acc_checking',
        amount: -32_500,
        rawDescriptor: 'WITHDRAWAL 4412',
        normalizedDescriptor: 'withdrawal',
      }),
      txn({
        id: 'in',
        accountId: 'acc_savings',
        amount: 32_500,
        rawDescriptor: 'DEPOSIT REF 88213',
        normalizedDescriptor: 'deposit ref',
      }),
    ]);

    expect(pairs).toHaveLength(1);
  });

  it('tolerates the inflow landing a couple of days later', () => {
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -20_000, postedAt: '2026-08-10' }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 20_000, postedAt: '2026-08-12' }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.daysApart).toBe(2);
  });

  it('does not pair across a long gap', () => {
    // Salary of exactly the same amount as a bill, three weeks apart, is a
    // coincidence rather than a transfer.
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -20_000, postedAt: '2026-08-01' }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 20_000, postedAt: '2026-08-25' }),
    ]);

    expect(pairs).toEqual([]);
  });

  it('does not pair two sides of the same account', () => {
    // A refund lands back where it left. That is not an internal transfer, and
    // treating it as one would hide both the purchase and the refund.
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -8_000 }),
      txn({ id: 'in', accountId: 'acc_checking', amount: 8_000 }),
    ]);

    expect(pairs).toEqual([]);
  });

  it('does not pair across currencies', () => {
    // 200 CAD out and 200 USD in is not the same money.
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_cad', amount: -20_000, currency: 'CAD' }),
      txn({ id: 'in', accountId: 'acc_usd', amount: 20_000, currency: 'USD' }),
    ]);

    expect(pairs).toEqual([]);
  });

  it('does not pair mismatched amounts', () => {
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -20_000 }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 19_950 }),
    ]);

    expect(pairs).toEqual([]);
  });

  it('ignores pending rows', () => {
    // A pending transaction can post later with a different date or amount, so
    // a match made against one quietly stops being true.
    const pairs = detectInternalTransfers([
      txn({ id: 'out', accountId: 'acc_checking', amount: -20_000, pending: true }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 20_000 }),
    ]);

    expect(pairs).toEqual([]);
  });

  it('never uses one transaction in two pairs', () => {
    // Two outflows, one inflow. Exactly one pair may form; the leftover outflow
    // stays a real expense rather than being matched twice.
    const pairs = detectInternalTransfers([
      txn({ id: 'out_a', accountId: 'acc_checking', amount: -25_000 }),
      txn({ id: 'out_b', accountId: 'acc_credit', amount: -25_000 }),
      txn({ id: 'in', accountId: 'acc_savings', amount: 25_000 }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(internalTransferIds(pairs).size).toBe(2);
  });

  it('is deterministic regardless of input order', () => {
    const rows = [
      txn({ id: 'out_a', accountId: 'acc_checking', amount: -25_000, postedAt: '2026-08-10' }),
      txn({ id: 'in_a', accountId: 'acc_savings', amount: 25_000, postedAt: '2026-08-10' }),
      txn({ id: 'out_b', accountId: 'acc_checking', amount: -25_000, postedAt: '2026-08-20' }),
      txn({ id: 'in_b', accountId: 'acc_savings', amount: 25_000, postedAt: '2026-08-20' }),
    ];

    const forwards = detectInternalTransfers(rows);
    const backwards = detectInternalTransfers([...rows].reverse());

    // Same-day counterparties pair with each other rather than crossing a
    // ten-day gap, whichever order the database returned them in.
    expect(forwards).toEqual(backwards);
    expect(forwards).toHaveLength(2);
    expect(forwards.every((pair) => pair.daysApart === 0)).toBe(true);
  });

  it('finds nothing in an ordinary month of spending', () => {
    // The expensive false positive: a paycheque and a rent payment of similar
    // size must not be mistaken for moving money between your own accounts.
    const pairs = detectInternalTransfers([
      txn({ id: 'salary', accountId: 'acc_checking', amount: 420_000, postedAt: '2026-08-01' }),
      txn({ id: 'rent', accountId: 'acc_checking', amount: -218_000, postedAt: '2026-08-01' }),
      txn({ id: 'coffee', accountId: 'acc_credit', amount: -450, postedAt: '2026-08-02' }),
      txn({ id: 'groceries', accountId: 'acc_credit', amount: -12_400, postedAt: '2026-08-03' }),
    ]);

    expect(pairs).toEqual([]);
  });
});
