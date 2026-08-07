/**
 * Runs the whole vertical slice in-process and prints the result.
 *
 *   npm run demo
 *
 * No HTTP, no database, no bank. Useful as a smoke test and as the fastest way
 * to see what the pipeline actually produces.
 */

import { categorizeDescriptor, coverageRate, ruleFromCorrection } from '../domain/categorization/categorize';
import { normalizeDescriptor } from '../domain/categorization/normalize';
import { budgetAlerts, computeBudgetProgress } from '../domain/budgets/progress';
import {
  addDays,
  comparablePreviousRange,
  monthRange,
  monthToDateRange,
  previousMonthRange,
} from '../domain/dates';
import { computeHealthScore } from '../domain/health-score/score';
import { cashFlowInsight, compareCategoryTotals, summarizePeriod } from '../domain/insights/insights';
import { detectSubscriptions, totalAnnualSubscriptionCost } from '../domain/insights/subscriptions';
import { formatMoney, money } from '../domain/money';
import type { Budget, Transaction } from '../domain/types';
import { SystemClock } from '../infra/clock';
import { MockAggregator } from '../infra/mock-aggregator';

const clock = new SystemClock();
const today = clock.today();

function heading(text: string): void {
  console.log(`\n${'─'.repeat(72)}\n${text}\n${'─'.repeat(72)}`);
}

async function main(): Promise<void> {
  console.log(`FINVERSE vertical slice — as of ${today}\n`);

  // ---------------------------------------------------------------- 1. import
  const aggregator = new MockAggregator({ today });
  const accounts = await aggregator.listAccounts('link_demo');
  const { transactions: raw } = await aggregator.fetchTransactions('link_demo');

  heading(`1. IMPORT — ${raw.length} transactions from ${accounts.length} accounts`);
  for (const account of accounts) {
    const utilization =
      account.type === 'credit_card' && account.creditLimit
        ? ` · ${((Math.max(0, -account.balanceCurrent) / account.creditLimit) * 100).toFixed(0)}% utilized`
        : '';
    console.log(
      `  ${account.name.padEnd(22)} ••${account.mask}  ${formatMoney(
        money(account.balanceCurrent, account.currency),
      ).padStart(12)}${utilization}`,
    );
  }

  // ----------------------------------------------------------- 2. categorize
  const results = raw.map((r) => ({ raw: r, cat: categorizeDescriptor(r.descriptor) }));
  const transactions: Transaction[] = results.map(({ raw: r, cat }) => ({
    id: `txn_${r.accountId}_${r.providerTxnId}`,
    accountId: r.accountId,
    providerTxnId: r.providerTxnId,
    postedAt: r.postedAt,
    amount: r.amount,
    currency: r.currency,
    rawDescriptor: r.descriptor,
    normalizedDescriptor: normalizeDescriptor(r.descriptor),
    merchant: cat.merchant,
    categorySlug: cat.categorySlug,
    categorySource: cat.source,
    categoryConfidence: cat.confidence,
    isRecurring: false,
    pending: r.pending,
  }));

  const coverage = coverageRate(results.map((r) => r.cat));
  const unknown = results.filter((r) => r.cat.source === 'unknown');

  heading(`2. CATEGORIZE — ${(coverage * 100).toFixed(1)}% coverage`);
  const bySource = new Map<string, number>();
  for (const r of results) bySource.set(r.cat.source, (bySource.get(r.cat.source) ?? 0) + 1);
  for (const [source, count] of [...bySource].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(14)} ${String(count).padStart(4)}`);
  }
  console.log(`\n  Sample of what normalization does to real descriptors:`);
  for (const sample of [
    'SQ *BLUE BOTTLE 0093 SAN FRAN CA',
    'AMZN Mktp US*2K4L9RT21',
    'TST* SWEETGREEN 1042',
    'SHELL OIL 574812 TX',
  ]) {
    const cat = categorizeDescriptor(sample);
    console.log(
      `    ${sample.padEnd(34)} -> ${normalizeDescriptor(sample).padEnd(18)} [${cat.categorySlug}]`,
    );
  }

  if (unknown.length > 0) {
    console.log(`\n  Needs review (${unknown.length}) — we refuse to guess:`);
    const seen = new Set<string>();
    for (const u of unknown) {
      const n = normalizeDescriptor(u.raw.descriptor);
      if (seen.has(n)) continue;
      seen.add(n);
      console.log(`    ${u.raw.descriptor}`);
      if (seen.size >= 3) break;
    }
  }

  // ------------------------------------------------- 3. correction backfill
  const target = unknown[0];
  if (target) {
    const rule = ruleFromCorrection(target.raw.descriptor, 'shopping', 'rule_demo');
    const affected = transactions.filter((t) => t.normalizedDescriptor.includes(rule.pattern));
    heading('3. USER CORRECTION — one fix, applied backwards');
    console.log(`  Corrected "${target.raw.descriptor}" -> shopping`);
    console.log(`  Rule created: contains "${rule.pattern}"`);
    console.log(`  Backfilled ${affected.length} past transaction(s) from the same merchant.`);
    for (const t of affected) {
      t.categorySlug = 'shopping';
      t.categorySource = 'user_rule';
      t.categoryConfidence = 1;
    }
  }

  // ------------------------------------------------------------- 4. budgets
  const budgets: Budget[] = [
    { id: 'bud_restaurants', categorySlug: 'restaurants', limitAmount: 25_000, currency: 'USD', period: 'monthly', rollover: false },
    { id: 'bud_groceries', categorySlug: 'groceries', limitAmount: 60_000, currency: 'USD', period: 'monthly', rollover: false },
    { id: 'bud_coffee', categorySlug: 'coffee', limitAmount: 6_000, currency: 'USD', period: 'monthly', rollover: false },
    { id: 'bud_delivery', categorySlug: 'food_delivery', limitAmount: 12_000, currency: 'USD', period: 'monthly', rollover: false },
  ];

  const period = monthRange(today);

  function printBudgets(label: string, range: { start: string; end: string }, asOf: string): void {
    console.log(`\n  ${label}  (${range.start} .. ${range.end})`);
    for (const budget of budgets) {
      const progress = computeBudgetProgress(budget, transactions, range, asOf);
      const bar = '█'.repeat(Math.min(20, Math.round(progress.percentUsed / 5))).padEnd(20, '·');
      console.log(
        `    ${budget.categorySlug.padEnd(15)} ${bar} ${progress.percentUsed.toFixed(0).padStart(4)}%  ` +
          `${formatMoney(money(progress.spentAmount, 'USD')).padStart(10)} / ${formatMoney(
            money(budget.limitAmount, 'USD'),
          ).padStart(10)}  [${progress.status}]`,
      );
      for (const alert of budgetAlerts(progress)) {
        console.log(`        ! ${alert.message}`);
      }
    }
  }

  heading('4. BUDGETS');
  // Month-to-date is what the user sees today; the last complete month is what
  // actually exercises the threshold and alert logic, since day 7 of a month
  // has barely any spend in it yet.
  printBudgets('This month so far', period, today);
  const lastMonth = previousMonthRange(today);
  printBudgets('Last complete month', lastMonth, lastMonth.end);

  // ------------------------------------------------------------ 5. insights
  const mtd = monthToDateRange(today);
  const comparable = comparablePreviousRange(today);
  const summary = summarizePeriod(transactions, mtd, 'USD');
  const previous = summarizePeriod(transactions, comparable, 'USD');

  heading(
    `5. INSIGHTS — ${mtd.start}..${mtd.end} vs ${comparable.start}..${comparable.end} (like for like)`,
  );
  console.log(`  Income            ${formatMoney(money(summary.income, 'USD')).padStart(12)}`);
  console.log(`  Expenses          ${formatMoney(money(summary.expenses, 'USD')).padStart(12)}`);
  console.log(`  Net cash flow     ${formatMoney(money(summary.netCashFlow, 'USD')).padStart(12)}`);
  console.log(`  Savings rate      ${`${summary.savingsRate.toFixed(1)}%`.padStart(12)}`);
  console.log(`  Avg daily spend   ${formatMoney(money(summary.averageDailySpend, 'USD')).padStart(12)}`);
  if (summary.topMerchant) {
    console.log(
      `  Top merchant      ${summary.topMerchant.merchant} (${formatMoney(
        money(summary.topMerchant.total, 'USD'),
      )} over ${summary.topMerchant.count})`,
    );
  }

  const insights = compareCategoryTotals(summary, previous, transactions);
  const cashFlow = cashFlowInsight(summary);
  if (cashFlow) insights.unshift(cashFlow);

  console.log('');
  for (const insight of insights.slice(0, 6)) {
    console.log(`  [${insight.severity.padEnd(8)}] ${insight.title}`);
    console.log(`              ${insight.detail} (${insight.evidenceTransactionIds.length} txns)`);
  }

  // ------------------------------------------------------- 6. subscriptions
  const subs = detectSubscriptions(transactions);
  heading(`6. SUBSCRIPTIONS — ${subs.length} detected, no user input`);
  for (const sub of subs) {
    console.log(
      `  ${sub.merchant.padEnd(24)} ${formatMoney(money(sub.typicalAmount, 'USD')).padStart(9)} / ${sub.cadence.padEnd(9)} ` +
        `= ${formatMoney(money(sub.annualCost, 'USD')).padStart(10)}/yr  (conf ${sub.confidence.toFixed(2)})`,
    );
    if (sub.priceIncrease) {
      console.log(
        `      ! Price went up ${sub.priceIncrease.percent.toFixed(0)}%: ` +
          `${formatMoney(money(sub.priceIncrease.from, 'USD'))} -> ${formatMoney(money(sub.priceIncrease.to, 'USD'))}`,
      );
    }
  }
  console.log(
    `\n  Total ${formatMoney(money(totalAnnualSubscriptionCost(subs), 'USD'))}/yr`,
  );

  // -------------------------------------------------------- 7. health score
  const adherence =
    budgets.filter(
      (b) => computeBudgetProgress(b, transactions, period, today).status !== 'exceeded',
    ).length / budgets.length;

  // Trailing 30 days, so "months of expenses saved" reflects a real monthly
  // run rate rather than however many days into the month we happen to be.
  const trailing30 = summarizePeriod(transactions, { start: addDays(today, -29), end: today }, 'USD');

  const health = computeHealthScore({
    summary: trailing30,
    accounts,
    transactions,
    budgetAdherenceRatio: adherence,
  });

  heading(`7. FINANCIAL HEALTH — ${health.score}/1000 (${health.band})`);
  for (const c of health.components) {
    const bar = '█'.repeat(Math.round(c.ratio * 20)).padEnd(20, '·');
    console.log(`  ${c.label.padEnd(20)} ${bar} ${String(c.points).padStart(3)}/${c.maxPoints}`);
    console.log(`  ${' '.repeat(20)} ${c.detail}`);
  }
  console.log('\n  What to do next:');
  for (const action of health.topActions) console.log(`    - ${action}`);

  console.log('');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
