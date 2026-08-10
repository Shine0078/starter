import type { Account, Transaction } from '../types';

export type DataQualityStatus = 'good' | 'attention' | 'no_data';
export type DataQualitySeverity = 'info' | 'warning' | 'critical';

export interface DataQualityIssue {
  code: string;
  severity: DataQualitySeverity;
  title: string;
  message: string;
  affectedCount: number;
}

export interface DataQualityReport {
  status: DataQualityStatus;
  score: number;
  checkedAt: string;
  transactionCount: number;
  accountCoverage: number;
  issues: DataQualityIssue[];
}

export interface DataQualityBankLink {
  status: string;
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface DataQualityInput {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  bankLinks: readonly DataQualityBankLink[];
  checkedAt: string;
  staleAfterHours?: number;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Deterministic checks that describe whether a report has trustworthy source
 * data. This deliberately does not delete or repair rows: a quality warning
 * must preserve the evidence and tell the user what needs attention.
 */
export function assessDataQuality(input: DataQualityInput): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  const accountIds = new Set(input.accounts.map((account) => account.id));
  const transactions = input.transactions;
  const staleAfterMs = (input.staleAfterHours ?? 36) * 60 * 60 * 1000;
  const checkedAtMs = Date.parse(input.checkedAt);

  const missingAccounts = transactions.filter((transaction) =>
    !accountIds.has(transaction.accountId),
  ).length;
  if (missingAccounts > 0) {
    issues.push({
      code: 'missing_account',
      severity: 'critical',
      title: 'Transactions need an account link',
      message: `${missingAccounts} transaction${missingAccounts === 1 ? '' : 's'} reference${missingAccounts === 1 ? 's' : ''} an account that is not available.`,
      affectedCount: missingAccounts,
    });
  }

  const invalidDates = transactions.filter((transaction) =>
    !isValidDateOnly(transaction.postedAt),
  ).length;
  if (invalidDates > 0) {
    issues.push({
      code: 'invalid_date',
      severity: 'critical',
      title: 'Some transaction dates are invalid',
      message: `${invalidDates} transaction${invalidDates === 1 ? '' : 's'} cannot be placed on the financial timeline.`,
      affectedCount: invalidDates,
    });
  }

  const invalidCurrencies = transactions.filter((transaction) =>
    !CURRENCY.test(transaction.currency),
  ).length;
  if (invalidCurrencies > 0) {
    issues.push({
      code: 'invalid_currency',
      severity: 'critical',
      title: 'Some transactions have invalid currencies',
      message: `${invalidCurrencies} transaction${invalidCurrencies === 1 ? '' : 's'} cannot be safely included in a currency total.`,
      affectedCount: invalidCurrencies,
    });
  }

  const providerIds = new Set<string>();
  const duplicateProviderIds = new Set<string>();
  for (const transaction of transactions) {
    const key = `${transaction.accountId}\u0000${transaction.providerTxnId}`;
    if (providerIds.has(key)) duplicateProviderIds.add(key);
    providerIds.add(key);
  }
  if (duplicateProviderIds.size > 0) {
    issues.push({
      code: 'duplicate_transaction',
      severity: 'critical',
      title: 'Duplicate transaction evidence detected',
      message: `${duplicateProviderIds.size} provider transaction${duplicateProviderIds.size === 1 ? '' : 's'} appear more than once.`,
      affectedCount: duplicateProviderIds.size,
    });
  }

  const brokenLinks = input.bankLinks.filter((link) =>
    link.status === 'error' || link.status === 'needs_reauth',
  ).length;
  if (brokenLinks > 0) {
    issues.push({
      code: 'provider_attention',
      severity: 'critical',
      title: 'A bank connection needs attention',
      message: `${brokenLinks} bank connection${brokenLinks === 1 ? '' : 's'} cannot currently guarantee fresh balances.`,
      affectedCount: brokenLinks,
    });
  }

  const staleLinks = input.bankLinks.filter((link) => {
    if (link.status === 'revoked' || link.status === 'error' || link.status === 'needs_reauth') return false;
    const syncedAt = link.lastSyncedAt ? Date.parse(link.lastSyncedAt) : NaN;
    const createdAt = Date.parse(link.createdAt);
    const reference = Number.isFinite(syncedAt) ? syncedAt : createdAt;
    return Number.isFinite(reference) && Number.isFinite(checkedAtMs) && checkedAtMs - reference > staleAfterMs;
  }).length;
  if (staleLinks > 0) {
    issues.push({
      code: 'stale_sync',
      severity: 'warning',
      title: 'A bank connection may be stale',
      message: `${staleLinks} active connection${staleLinks === 1 ? '' : 's'} has not reported fresh data recently.`,
      affectedCount: staleLinks,
    });
  }

  const matchedTransactions = transactions.length - missingAccounts;
  const accountCoverage = transactions.length === 0
    ? 1
    : roundRatio(matchedTransactions, transactions.length);
  const score = scoreIssues(issues);
  const status: DataQualityStatus = input.accounts.length === 0 &&
      input.bankLinks.length === 0 &&
      transactions.length === 0
    ? 'no_data'
    : score >= 85 && issues.length === 0
        ? 'good'
        : 'attention';

  return {
    status,
    score,
    checkedAt: input.checkedAt,
    transactionCount: transactions.length,
    accountCoverage,
    issues,
  };
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(value);
}

function roundRatio(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function scoreIssues(issues: readonly DataQualityIssue[]): number {
  const penalty = issues.reduce((total, issue) => total + (
    issue.severity === 'critical' ? 35 : issue.severity === 'warning' ? 15 : 5
  ), 0);
  return Math.max(0, 100 - penalty);
}
