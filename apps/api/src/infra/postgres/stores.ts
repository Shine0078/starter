/**
 * Postgres implementations of the four store ports.
 *
 * Every method takes `userId` and every statement filters on it. That is not
 * belt-and-braces: a missing user scope in a finance app leaks one person's
 * transactions to another. The in-memory stores are keyed the same way so the
 * mistake surfaces in tests rather than in production.
 *
 * Since 003_rls.sql there is a second line of defence underneath. Each method
 * runs inside `withUserScope`, which opens a transaction and pins
 * `finverse.user_id`; the row-level security policies compare every row against
 * it. A statement that loses its `WHERE user_id = $1` now returns nothing
 * instead of everything. The explicit predicates stay — two independent controls
 * are the point, and dropping the visible one would make these queries look like
 * they leak to anyone reading them.
 */

import type { Pool, PoolClient } from 'pg';

import type {
  Account,
  Budget,
  CategorizationRule,
  GoalContribution,
  NotificationPreferences,
  NetWorthSnapshot,
  SavingsGoal,
  UserNotification,
  Transaction,
} from '../../domain/types';
import { CATEGORIES } from '../../domain/categories';
import type {
  SplitExpense,
  SplitGroup,
  SplitGroupMember,
  SplitSettlement,
} from '../../domain/split/types';
import type {
  AccountStore,
  BudgetStore,
  GoalStore,
  NotificationStore,
  RuleStore,
  SplitStore,
  TransactionQuery,
  TransactionStore,
} from '../../ports';
import { withUserScope } from './pool';
import {
  chunk,
  placeholders,
  toAccount,
  toBudget,
  toGoal,
  toGoalContribution,
  toNotification,
  toNotificationPreferences,
  toRule,
  toSplitExpense,
  toSplitGroup,
  toSplitMember,
  toSplitParticipant,
  toSplitSettlement,
  toTransaction,
  type AccountRow,
  type BudgetRow,
  type GoalContributionRow,
  type GoalRow,
  type NotificationPreferenceRow,
  type NotificationRow,
  type RuleRow,
  type SplitExpenseRow,
  type SplitGroupRow,
  type SplitMemberRow,
  type SplitParticipantRow,
  type SplitSettlementRow,
  type TransactionRow,
} from './rows';

/**
 * Users are created lazily on first write.
 *
 * Real registration exists now, but the store ports are also driven by the
 * demo seed and the contract suite, which have no account behind them. Without
 * this every such write fails its foreign key, and dropping the FK to avoid
 * that would give up the cascade that makes account deletion actually delete
 * things.
 *
 * `users` carries no RLS policy, so this works inside a scoped transaction:
 * identity has to be readable before the user is known.
 */
async function ensureUser(client: PoolClient, userId: string): Promise<void> {
  await client.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [userId]);
}

// ---------------------------------------------------------------- accounts

const ACCOUNT_COLUMNS = `
  id, name, type, mask, currency, balance_current,
  credit_limit, statement_day, payment_due_day, source
`;

export class PostgresAccountStore implements AccountStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<Account[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<AccountRow>(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = $1 ORDER BY name`,
        [userId],
      );
      return rows.map(toAccount);
    });
  }

  async get(userId: string, accountId: string): Promise<Account | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<AccountRow>(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE user_id = $1 AND id = $2`,
        [userId, accountId],
      );
      return rows[0] ? toAccount(rows[0]) : null;
    });
  }

  async upsertMany(userId: string, accounts: readonly Account[]): Promise<void> {
    if (accounts.length === 0) return;

    await withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);

      const values: unknown[] = [];
      const tuples: string[] = [];

      accounts.forEach((account, index) => {
        tuples.push(placeholders(11, index));
        values.push(
          account.id,
          userId,
          account.name,
          account.type,
          account.mask,
          account.currency,
          account.balanceCurrent,
          account.creditLimit ?? null,
          account.statementDay ?? null,
          account.paymentDueDay ?? null,
          account.source ?? 'provider',
        );
      });

      await client.query(
        `INSERT INTO accounts (
           id, user_id, name, type, mask, currency,
           balance_current, credit_limit, statement_day, payment_due_day, source
         ) VALUES ${tuples.join(', ')}
         ON CONFLICT (user_id, id) DO UPDATE SET
           name            = EXCLUDED.name,
           type            = EXCLUDED.type,
           mask            = EXCLUDED.mask,
           currency        = EXCLUDED.currency,
           balance_current = EXCLUDED.balance_current,
           credit_limit    = EXCLUDED.credit_limit,
           statement_day   = EXCLUDED.statement_day,
           payment_due_day = EXCLUDED.payment_due_day,
           source          = EXCLUDED.source,
           updated_at      = now()`,
        values,
      );
    });
  }

  async remove(userId: string, accountId: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM accounts WHERE user_id = $1 AND id = $2',
        [userId, accountId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async recordNetWorthSnapshot(
    userId: string,
    recordedOn: string,
  ): Promise<NetWorthSnapshot[]> {
    return withUserScope(this.pg, userId, async (client) => {
      // Replace the whole observation for this day. If the user removed their
      // final CAD account, retaining yesterday's same-day CAD row would show a
      // balance they no longer own.
      await client.query(
        'DELETE FROM net_worth_snapshots WHERE user_id = $1 AND recorded_on = $2::date',
        [userId, recordedOn],
      );
      const { rows } = await client.query<{
        recorded_on: string;
        currency: string;
        assets: number;
        debts: number;
        net_position: number;
      }>(
        `INSERT INTO net_worth_snapshots
           (user_id, recorded_on, currency, assets, debts, net_position)
         SELECT
           $1,
           $2::date,
           currency,
           sum(CASE WHEN balance_current >= 0 THEN balance_current ELSE 0 END),
           sum(CASE WHEN balance_current < 0 THEN -balance_current ELSE 0 END),
           sum(balance_current)
         FROM accounts
         WHERE user_id = $1
         GROUP BY currency
         RETURNING recorded_on, currency, assets, debts, net_position`,
        [userId, recordedOn],
      );
      return rows.map(toNetWorthSnapshot);
    });
  }

  async listNetWorthHistory(userId: string, limit = 365): Promise<NetWorthSnapshot[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<{
        recorded_on: string;
        currency: string;
        assets: number;
        debts: number;
        net_position: number;
      }>(
        `SELECT recorded_on, currency, assets, debts, net_position
         FROM (
           SELECT recorded_on, currency, assets, debts, net_position
           FROM net_worth_snapshots
           WHERE user_id = $1
           ORDER BY recorded_on DESC, currency
           LIMIT $2
         ) recent
         ORDER BY recorded_on, currency`,
        [userId, limit],
      );
      return rows.map(toNetWorthSnapshot);
    });
  }
}

function toNetWorthSnapshot(row: {
  recorded_on: string;
  currency: string;
  assets: number;
  debts: number;
  net_position: number;
}): NetWorthSnapshot {
  return {
    recordedOn: row.recorded_on,
    currency: row.currency,
    assets: row.assets,
    debts: row.debts,
    netPosition: row.net_position,
  };
}

// ------------------------------------------------------------ transactions

const TXN_COLUMNS = `
  id, account_id, provider_txn_id, posted_at, amount, currency,
  raw_descriptor, normalized_descriptor, merchant,
  merchant_override, note, excluded_from_analytics,
  category_slug, category_source, category_confidence, is_recurring, recurring_override,
  duplicate_reported, pending
`;

const TXN_INSERT_COLUMNS = 20;

export class PostgresTransactionStore implements TransactionStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string, query: TransactionQuery = {}): Promise<Transaction[]> {
    const where: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];

    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.accountId) where.push(`account_id = ${bind(query.accountId)}`);
    if (query.categorySlug) where.push(`category_slug = ${bind(query.categorySlug)}`);
    if (query.categoryKind) {
      const slugs = CATEGORIES.filter((category) => category.kind === query.categoryKind)
        .map((category) => category.slug);
      if (slugs.length === 0) return [];
      where.push(`category_slug = ANY(${bind(slugs)}::text[])`);
    }
    if (query.range) {
      where.push(`posted_at >= ${bind(query.range.start)}`);
      where.push(`posted_at <= ${bind(query.range.end)}`);
    }
    if (query.before) {
      const date = bind(query.before.postedAt);
      const id = bind(query.before.id);
      where.push(`(posted_at < ${date} OR (posted_at = ${date} AND id < ${id}))`);
    }
    if (query.search) {
      // ILIKE against provider and user-owned text so search matches what the
      // user sees without losing the original bank descriptor.
      const needle = bind(`%${query.search}%`);
      where.push(
        `(normalized_descriptor ILIKE ${needle} OR raw_descriptor ILIKE ${needle} OR merchant ILIKE ${needle} OR merchant_override ILIKE ${needle} OR note ILIKE ${needle})`,
      );
    }
    if (query.pending !== undefined) where.push(`pending = ${bind(query.pending)}`);
    if (query.recurring !== undefined) where.push(`is_recurring = ${bind(query.recurring)}`);
    if (query.amountMin !== undefined) where.push(`ABS(amount) >= ${bind(query.amountMin)}`);
    if (query.amountMax !== undefined) where.push(`ABS(amount) <= ${bind(query.amountMax)}`);

    // Tie-break on id so pagination is stable when many rows share a date.
    let sql = `SELECT ${TXN_COLUMNS} FROM transactions
               WHERE ${where.join(' AND ')}
               ORDER BY posted_at DESC, id DESC`;

    if (query.limit !== undefined) sql += ` LIMIT ${bind(query.limit)}`;

    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<TransactionRow>(sql, values);
      return rows.map(toTransaction);
    });
  }

  async get(userId: string, id: string): Promise<Transaction | null> {
    return withUserScope(this.pg, userId, (client) => fetchTransaction(client, userId, id));
  }

  /**
   * Idempotent on `(user_id, account_id, provider_txn_id)`.
   *
   * Two things the ON CONFLICT clause does that are easy to get wrong:
   *
   *  - It never overwrites a category the user set by hand. An aggregator
   *    resending a transaction must not silently revert a correction.
   *  - It keeps the existing row's `id`, so anything already referencing it
   *    stays valid.
   *
   * `xmax = 0` is Postgres' way of telling insert from update in RETURNING.
   *
   * All batches share one transaction, so a sync that fails halfway leaves no
   * partial history behind.
   */
  async upsertMany(
    userId: string,
    transactions: readonly Transaction[],
  ): Promise<{ inserted: number; updated: number }> {
    if (transactions.length === 0) return { inserted: 0, updated: 0 };

    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);

      let inserted = 0;
      let updated = 0;

      for (const batch of chunk(transactions, 500)) {
        const values: unknown[] = [];
        const tuples: string[] = [];

        batch.forEach((txn, index) => {
          tuples.push(placeholders(TXN_INSERT_COLUMNS, index));
          values.push(
            txn.id,
            userId,
            txn.accountId,
            txn.providerTxnId,
            txn.postedAt,
            txn.amount,
            txn.currency,
            txn.rawDescriptor,
            txn.normalizedDescriptor,
            txn.merchant ?? null,
            txn.merchantOverride ?? null,
            txn.note ?? null,
            txn.excludedFromAnalytics ?? false,
            txn.categorySlug,
            txn.categorySource,
            txn.categoryConfidence,
            txn.isRecurring,
            txn.recurringOverride ?? null,
            txn.duplicateReported ?? false,
            txn.pending,
          );
        });

        const { rows } = await client.query<{ inserted: boolean }>(
          `INSERT INTO transactions (
             id, user_id, account_id, provider_txn_id, posted_at, amount, currency,
             raw_descriptor, normalized_descriptor, merchant,
             merchant_override, note, excluded_from_analytics,
             category_slug, category_source, category_confidence, is_recurring, recurring_override,
             duplicate_reported, pending
           ) VALUES ${tuples.join(', ')}
           ON CONFLICT (user_id, account_id, provider_txn_id) DO UPDATE SET
             posted_at             = EXCLUDED.posted_at,
             amount                = EXCLUDED.amount,
             currency              = EXCLUDED.currency,
             raw_descriptor        = EXCLUDED.raw_descriptor,
             normalized_descriptor = EXCLUDED.normalized_descriptor,
             pending               = EXCLUDED.pending,
             excluded_from_analytics = transactions.excluded_from_analytics,
             merchant_override = transactions.merchant_override,
             note = transactions.note,
             merchant = CASE
               WHEN transactions.category_source IN ('user_manual', 'user_rule')
                 THEN transactions.merchant
               ELSE EXCLUDED.merchant END,
             category_slug = CASE
               WHEN transactions.category_source IN ('user_manual', 'user_rule')
                 THEN transactions.category_slug
               ELSE EXCLUDED.category_slug END,
             category_source = CASE
               WHEN transactions.category_source IN ('user_manual', 'user_rule')
                 THEN transactions.category_source
               ELSE EXCLUDED.category_source END,
             category_confidence = CASE
               WHEN transactions.category_source IN ('user_manual', 'user_rule')
                 THEN transactions.category_confidence
               ELSE EXCLUDED.category_confidence END,
             recurring_override = transactions.recurring_override,
             duplicate_reported = transactions.duplicate_reported,
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          values,
        );

        for (const row of rows) {
          if (row.inserted) inserted += 1;
          else updated += 1;
        }
      }

      return { inserted, updated };
    });
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Transaction>,
  ): Promise<Transaction | null> {
    const COLUMN_OF: Partial<Record<keyof Transaction, string>> = {
      postedAt: 'posted_at',
      amount: 'amount',
      currency: 'currency',
      rawDescriptor: 'raw_descriptor',
      normalizedDescriptor: 'normalized_descriptor',
      merchant: 'merchant',
      merchantOverride: 'merchant_override',
      note: 'note',
      excludedFromAnalytics: 'excluded_from_analytics',
      categorySlug: 'category_slug',
      categorySource: 'category_source',
      categoryConfidence: 'category_confidence',
      isRecurring: 'is_recurring',
      recurringOverride: 'recurring_override',
      duplicateReported: 'duplicate_reported',
      pending: 'pending',
    };

    const assignments: string[] = [];
    const values: unknown[] = [userId, id];

    for (const [key, column] of Object.entries(COLUMN_OF)) {
      if (!(key in patch)) continue;
      const value = patch[key as keyof Transaction];
      values.push(value ?? null);
      assignments.push(`${column} = $${values.length}`);
    }

    return withUserScope(this.pg, userId, async (client) => {
      // Nothing to change — return the row as it stands rather than emitting
      // `SET updated_at = now()` on its own.
      if (assignments.length === 0) return fetchTransaction(client, userId, id);

      const { rows } = await client.query<TransactionRow>(
        `UPDATE transactions SET ${assignments.join(', ')}, updated_at = now()
         WHERE user_id = $1 AND id = $2
         RETURNING ${TXN_COLUMNS}`,
        values,
      );

      return rows[0] ? toTransaction(rows[0]) : null;
    });
  }

  async removeByProviderIds(userId: string, providerTxnIds: readonly string[]): Promise<number> {
    if (providerTxnIds.length === 0) return 0;
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM transactions WHERE user_id = $1 AND provider_txn_id = ANY($2::text[])',
        [userId, providerTxnIds],
      );
      return result.rowCount ?? 0;
    });
  }
}

/** Shared by `get` and the no-op path of `update`, which is already in scope. */
async function fetchTransaction(
  client: PoolClient,
  userId: string,
  id: string,
): Promise<Transaction | null> {
  const { rows } = await client.query<TransactionRow>(
    `SELECT ${TXN_COLUMNS} FROM transactions WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? toTransaction(rows[0]) : null;
}

// ----------------------------------------------------------------- budgets

const BUDGET_COLUMNS = 'id, category_slug, limit_amount, currency, period, rollover';

export class PostgresBudgetStore implements BudgetStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<Budget[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BudgetRow>(
        `SELECT ${BUDGET_COLUMNS} FROM budgets WHERE user_id = $1 ORDER BY category_slug`,
        [userId],
      );
      return rows.map(toBudget);
    });
  }

  async get(userId: string, id: string): Promise<Budget | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BudgetRow>(
        `SELECT ${BUDGET_COLUMNS} FROM budgets WHERE user_id = $1 AND id = $2`,
        [userId, id],
      );
      return rows[0] ? toBudget(rows[0]) : null;
    });
  }

  /** Upsert, matching the in-memory store. Budget ids are derived from the
   *  category, so re-creating one edits it rather than duplicating it. */
  async create(userId: string, budget: Budget): Promise<Budget> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);

      const { rows } = await client.query<BudgetRow>(
        `INSERT INTO budgets (id, user_id, category_slug, limit_amount, currency, period, rollover)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, category_slug) DO UPDATE SET
           limit_amount = EXCLUDED.limit_amount,
           currency     = EXCLUDED.currency,
           period       = EXCLUDED.period,
           rollover     = EXCLUDED.rollover
         RETURNING ${BUDGET_COLUMNS}`,
        [
          budget.id,
          userId,
          budget.categorySlug,
          budget.limitAmount,
          budget.currency,
          budget.period,
          budget.rollover,
        ],
      );

      return toBudget(rows[0]!);
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query('DELETE FROM budgets WHERE user_id = $1 AND id = $2', [
        userId,
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    });
  }
}

// -------------------------------------------------------------------- goals

const GOAL_COLUMNS = 'id, name, target_amount, currency, target_date, created_at';
const CONTRIBUTION_COLUMNS = 'id, goal_id, amount, contributed_at';

export class PostgresGoalStore implements GoalStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<SavingsGoal[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<GoalRow>(
        `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = $1 ORDER BY created_at, id`,
        [userId],
      );
      return rows.map(toGoal);
    });
  }

  async get(userId: string, id: string): Promise<SavingsGoal | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<GoalRow>(
        `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = $1 AND id = $2`,
        [userId, id],
      );
      return rows[0] ? toGoal(rows[0]) : null;
    });
  }

  async create(userId: string, goal: SavingsGoal): Promise<SavingsGoal> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      const { rows } = await client.query<GoalRow>(
        `INSERT INTO goals
           (id, user_id, name, target_amount, currency, target_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${GOAL_COLUMNS}`,
        [
          goal.id,
          userId,
          goal.name,
          goal.targetAmount,
          goal.currency,
          goal.targetDate,
          goal.createdAt,
        ],
      );
      return toGoal(rows[0]!);
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query('DELETE FROM goals WHERE user_id = $1 AND id = $2', [
        userId,
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async listContributions(userId: string, goalId: string): Promise<GoalContribution[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<GoalContributionRow>(
        `SELECT ${CONTRIBUTION_COLUMNS} FROM goal_contributions
         WHERE user_id = $1 AND goal_id = $2 ORDER BY contributed_at, id`,
        [userId, goalId],
      );
      return rows.map(toGoalContribution);
    });
  }

  async addContribution(
    userId: string,
    contribution: GoalContribution,
  ): Promise<GoalContribution> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<GoalContributionRow>(
        `INSERT INTO goal_contributions (id, user_id, goal_id, amount, contributed_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${CONTRIBUTION_COLUMNS}`,
        [
          contribution.id,
          userId,
          contribution.goalId,
          contribution.amount,
          contribution.contributedAt,
        ],
      );
      return toGoalContribution(rows[0]!);
    });
  }
}

// ------------------------------------------------------------ notifications

const NOTIFICATION_COLUMNS =
  'id, kind, title, message, severity, dedupe_key, read_at, created_at';
const PREFERENCE_COLUMNS =
  'budget, bills, credit_utilization, subscriptions, low_balance, unusual_transactions, bank_sync, security';

export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<UserNotification[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<NotificationRow>(
        `SELECT ${NOTIFICATION_COLUMNS} FROM notifications
         WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
        [userId],
      );
      return rows.map(toNotification);
    });
  }

  async upsert(userId: string, notification: UserNotification): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      const result = await client.query(
        `INSERT INTO notifications
           (id, user_id, kind, title, message, severity, dedupe_key, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
        [
          notification.id,
          userId,
          notification.kind,
          notification.title,
          notification.message,
          notification.severity,
          notification.dedupeKey,
          notification.readAt,
          notification.createdAt,
        ],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async markRead(userId: string, id: string, at: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, $3)
         WHERE user_id = $1 AND id = $2`,
        [userId, id, at],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      const { rows } = await client.query<NotificationPreferenceRow>(
        `INSERT INTO notification_preferences (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING ${PREFERENCE_COLUMNS}`,
        [userId],
      );
      return toNotificationPreferences(rows[0]!);
    });
  }

  async updatePreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);
      const { rows } = await client.query<NotificationPreferenceRow>(
        `INSERT INTO notification_preferences
           (user_id, budget, bills, credit_utilization, subscriptions, low_balance,
            unusual_transactions, bank_sync, security)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id) DO UPDATE SET
           budget = EXCLUDED.budget,
           bills = EXCLUDED.bills,
           credit_utilization = EXCLUDED.credit_utilization,
           subscriptions = EXCLUDED.subscriptions,
           low_balance = EXCLUDED.low_balance,
           unusual_transactions = EXCLUDED.unusual_transactions,
           bank_sync = EXCLUDED.bank_sync,
           security = EXCLUDED.security,
           updated_at = now()
         RETURNING ${PREFERENCE_COLUMNS}`,
        [
          userId,
          preferences.budget,
          preferences.bills,
          preferences.creditUtilization,
          preferences.subscriptions,
          preferences.lowBalance,
          preferences.unusualTransactions,
          preferences.bankSync,
          preferences.security,
        ],
      );
      return toNotificationPreferences(rows[0]!);
    });
  }
}

// ------------------------------------------------------------------- rules

const RULE_COLUMNS = 'id, match_type, pattern, category_slug, priority';

export class PostgresRuleStore implements RuleStore {
  constructor(private readonly pg: Pool) {}

  async list(userId: string): Promise<CategorizationRule[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<RuleRow>(
        `SELECT ${RULE_COLUMNS} FROM categorization_rules
         WHERE user_id = $1 ORDER BY priority, id`,
        [userId],
      );
      return rows.map(toRule);
    });
  }

  async create(userId: string, rule: CategorizationRule): Promise<CategorizationRule> {
    return withUserScope(this.pg, userId, async (client) => {
      await ensureUser(client, userId);

      const { rows } = await client.query<RuleRow>(
        `INSERT INTO categorization_rules (id, user_id, match_type, pattern, category_slug, priority)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, id) DO UPDATE SET
           match_type    = EXCLUDED.match_type,
           pattern       = EXCLUDED.pattern,
           category_slug = EXCLUDED.category_slug,
           priority      = EXCLUDED.priority
         RETURNING ${RULE_COLUMNS}`,
        [rule.id, userId, rule.matchType, rule.pattern, rule.categorySlug, rule.priority],
      );

      return toRule(rows[0]!);
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM categorization_rules WHERE user_id = $1 AND id = $2',
        [userId, id],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }
}

// ------------------------------------------------------------------- splits

const SPLIT_GROUP_COLUMNS = 'id, name, currency, created_by, created_at, archived_at';
const SPLIT_MEMBER_COLUMNS = 'group_id, user_id, role, joined_at';
const SPLIT_EXPENSE_COLUMNS = `
  id, group_id, description, category, amount, currency,
  paid_by_user_id, split_method, date, created_at
`;
const SPLIT_PARTICIPANT_COLUMNS = 'expense_id, group_id, user_id, amount';
const SPLIT_SETTLEMENT_COLUMNS =
  'id, group_id, from_user_id, to_user_id, amount, currency, note, created_at';

export class PostgresSplitStore implements SplitStore {
  constructor(private readonly pg: Pool) {}

  async listGroups(userId: string): Promise<SplitGroup[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SplitGroupRow>(
        `SELECT g.id, g.name, g.currency, g.created_by, g.created_at, g.archived_at
           FROM split_groups g
           JOIN split_group_members m ON m.group_id = g.id
          WHERE m.user_id = $1 AND g.archived_at IS NULL
          ORDER BY g.created_at, g.id`,
        [userId],
      );
      return rows.map(toSplitGroup);
    });
  }

  async getGroup(userId: string, groupId: string): Promise<SplitGroup | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SplitGroupRow>(
        `SELECT ${SPLIT_GROUP_COLUMNS} FROM split_groups
         WHERE id = $1 AND finverse_is_split_member(id)`,
        [groupId],
      );
      return rows[0] ? toSplitGroup(rows[0]) : null;
    });
  }

  async createGroup(
    userId: string,
    group: SplitGroup,
    membership: SplitGroupMember,
  ): Promise<SplitGroup> {
    return withUserScope(this.pg, userId, async (client) => {
      // No RETURNING here: on an RLS table, INSERT ... RETURNING re-checks the
      // row against the SELECT policy, which fails for a group whose membership
      // has not been inserted yet. The full object is already in hand.
      await client.query(
        `INSERT INTO split_groups (id, name, currency, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [group.id, group.name, group.currency, userId, group.createdAt],
      );
      await client.query(
        `INSERT INTO split_group_members (group_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [membership.groupId, membership.userId, membership.role],
      );
      return group;
    });
  }

  async archiveGroup(userId: string, groupId: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        `UPDATE split_groups SET archived_at = now()
         WHERE id = $1 AND archived_at IS NULL AND finverse_is_split_member(id)`,
        [groupId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async listMembers(userId: string, groupId: string): Promise<SplitGroupMember[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SplitMemberRow>(
        `SELECT ${SPLIT_MEMBER_COLUMNS} FROM split_group_members
         WHERE group_id = $1 ORDER BY joined_at, user_id`,
        [groupId],
      );
      return rows.map(toSplitMember);
    });
  }

  async addMember(
    userId: string,
    membership: SplitGroupMember,
  ): Promise<SplitGroupMember> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `INSERT INTO split_group_members (group_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [membership.groupId, membership.userId, membership.role],
      );
      return membership;
    });
  }

  async listExpenses(userId: string, groupId: string): Promise<SplitExpense[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SplitExpenseRow>(
        `SELECT ${SPLIT_EXPENSE_COLUMNS} FROM split_expenses
         WHERE group_id = $1 ORDER BY date DESC, id DESC`,
        [groupId],
      );
      const participants = await client.query<SplitParticipantRow>(
        `SELECT ${SPLIT_PARTICIPANT_COLUMNS} FROM split_expense_participants
         WHERE group_id = $1`,
        [groupId],
      );
      const byExpense = new Map<string, typeof participants.rows>();
      for (const row of participants.rows) {
        const list = byExpense.get(row.expense_id) ?? [];
        list.push(row);
        byExpense.set(row.expense_id, list);
      }
      return rows.map((row) =>
        toSplitExpense(row, (byExpense.get(row.id) ?? []).map(toSplitParticipant)),
      );
    });
  }

  async addExpense(userId: string, expense: SplitExpense): Promise<SplitExpense> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `INSERT INTO split_expenses
           (id, group_id, description, category, amount, currency,
            paid_by_user_id, split_method, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          expense.id,
          expense.groupId,
          expense.description,
          expense.category,
          expense.amount,
          expense.currency,
          expense.paidByUserId,
          expense.splitMethod,
          expense.date,
        ],
      );
      for (const participant of expense.participants) {
        await client.query(
          `INSERT INTO split_expense_participants (expense_id, group_id, user_id, amount)
           VALUES ($1, $2, $3, $4)`,
          [expense.id, expense.groupId, participant.userId, participant.amount],
        );
      }
      return expense;
    });
  }

  async listSettlements(userId: string, groupId: string): Promise<SplitSettlement[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<SplitSettlementRow>(
        `SELECT ${SPLIT_SETTLEMENT_COLUMNS} FROM split_settlements
         WHERE group_id = $1 ORDER BY created_at DESC, id DESC`,
        [groupId],
      );
      return rows.map(toSplitSettlement);
    });
  }

  async addSettlement(
    userId: string,
    settlement: SplitSettlement,
  ): Promise<SplitSettlement> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `INSERT INTO split_settlements
           (id, group_id, from_user_id, to_user_id, amount, currency, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          settlement.id,
          settlement.groupId,
          settlement.fromUserId,
          settlement.toUserId,
          settlement.amount,
          settlement.currency,
          settlement.note || null,
        ],
      );
      return settlement;
    });
  }
}