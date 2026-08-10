import { describe, expect, it } from 'vitest';

import { transactionsToCsv } from '../src/domain/exports/transactions-csv';
import type { Transaction } from '../src/domain/types';

const transaction: Transaction = {
  id: 'txn_1',
  accountId: 'account_1',
  providerTxnId: 'provider_1',
  postedAt: '2026-08-07',
  amount: -12345,
  currency: 'USD',
  rawDescriptor: '=HYPERLINK("https://attacker.example")',
  normalizedDescriptor: 'hyperlink',
  merchant: 'Store "One", Inc.',
  merchantOverride: 'Reimbursable store',
  note: 'Keep the receipt',
  excludedFromAnalytics: true,
  categorySlug: 'shopping',
  categorySource: 'user_manual',
  categoryConfidence: 1,
  isRecurring: false,
  pending: false,
};

describe('transactionsToCsv', () => {
  it('exports the complete portable ledger shape in minor units', () => {
    const csv = transactionsToCsv([transaction]);

    expect(csv).toContain('"amount_minor"');
    expect(csv).toContain('"-12345"');
    expect(csv).toContain('"shopping"');
    expect(csv).toContain('"Reimbursable store"');
    expect(csv).toContain('"Keep the receipt"');
    expect(csv).toContain('"true"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('escapes quotes and neutralizes spreadsheet formulas in untrusted text', () => {
    const csv = transactionsToCsv([transaction]);

    expect(csv).toContain('"\'=HYPERLINK(""https://attacker.example"")"');
    expect(csv).toContain('"Store ""One"", Inc."');
  });
});
