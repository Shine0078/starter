import type { Transaction } from '../types';

/**
 * Excel and similar tools treat cells beginning with these characters as
 * formulas. Financial exports often contain untrusted merchant names, so
 * exporting them raw would turn a download into a formula-injection vector.
 */
function cell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A portable, user-owned ledger export. Amounts stay in minor units. */
export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const header = [
    'id',
    'account_id',
    'provider_transaction_id',
    'posted_at',
    'amount_minor',
    'currency',
    'merchant',
    'merchant_override',
    'note',
    'excluded_from_analytics',
    'descriptor',
    'category',
    'category_source',
    'category_confidence',
    'recurring',
    'duplicate_reported',
    'pending',
    'tags',
  ];
  const rows = transactions.map((transaction) =>
    [
      transaction.id,
      transaction.accountId,
      transaction.providerTxnId,
      transaction.postedAt,
      transaction.amount,
      transaction.currency,
      transaction.merchant,
      transaction.merchantOverride,
      transaction.note,
      transaction.excludedFromAnalytics ?? false,
      transaction.rawDescriptor,
      transaction.categorySlug,
      transaction.categorySource,
      transaction.categoryConfidence,
      transaction.isRecurring,
      transaction.duplicateReported ?? false,
      transaction.pending,
      transaction.tags?.join('|'),
    ]
      .map(cell)
      .join(','),
  );

  return [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
