/**
 * One suite, run against every implementation of the store ports.
 *
 * The point of ADR-0002 is that the domain cannot tell which adapter it is
 * talking to. That only holds if the adapters actually behave identically, and
 * the differences that matter here are the quiet ones — a date shifted by a
 * timezone, a bigint returned as a string, a user's correction reverted on
 * re-sync. None of those throw. They just make the numbers wrong.
 *
 * So the contract is written once and executed twice.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '../src/domain/types';
import type {
  AccountStore,
  BudgetStore,
  GoalStore,
  NotificationStore,
  RuleStore,
  TransactionStore,
} from '../src/ports';

export interface StoreSet {
  accounts: AccountStore;
  transactions: TransactionStore;
  budgets: BudgetStore;
  goals: GoalStore;
  notifications: NotificationStore;
  rules: RuleStore;
  /** Wipe all data between tests. */
  reset(): Promise<void>;
  /** Release connections, if any. */
  teardown(): Promise<void>;
}

const USER = 'user_contract';
const OTHER = 'user_other';

const ACCOUNT = {
  id: 'acc_checking',
  name: 'Everyday Checking',
  type: 'checking' as const,
  mask: '4412',
  currency: 'USD',
  balanceCurrent: 384_512,
};

const CREDIT = {
  id: 'acc_credit',
  name: 'Rewards Visa',
  type: 'credit_card' as const,
  mask: '6411',
  currency: 'USD',
  balanceCurrent: -142_300,
  creditLimit: 500_000,
  statementDay: 18,
  paymentDueDay: 12,
};

function txn(overrides: Partial<Transaction> & { providerTxnId: string }): Transaction {
  return {
    id: `txn_acc_checking_${overrides.providerTxnId}`,
    accountId: 'acc_checking',
    postedAt: '2026-08-10',
    amount: -4_250,
    currency: 'USD',
    rawDescriptor: 'SQ *BLUE BOTTLE 0093 SAN FRAN CA',
    normalizedDescriptor: 'blue bottle san fran',
    merchant: 'Blue Bottle',
    categorySlug: 'coffee',
    categorySource: 'lexicon',
    categoryConfidence: 0.95,
    isRecurring: false,
    pending: false,
    ...overrides,
  };
}

export function runStoreContract(name: string, create: () => Promise<StoreSet>): void {
  describe(`store contract: ${name}`, () => {
    let stores: StoreSet;

    beforeEach(async () => {
      stores ??= await create();
      await stores.reset();
      // Accounts first — transactions reference them.
      await stores.accounts.upsertMany(USER, [ACCOUNT, CREDIT]);
    });

    afterAll(async () => {
      await stores?.teardown();
    });

    describe('accounts', () => {
      it('round-trips every field', async () => {
        const found = await stores.accounts.get(USER, 'acc_credit');
        expect(found).toEqual(CREDIT);
      });

      it('omits optional fields rather than returning null', async () => {
        // `creditLimit: null` would slip past `?? 0` guards downstream and
        // produce a NaN utilization instead of a missing one.
        const found = await stores.accounts.get(USER, 'acc_checking');
        expect(found).toEqual(ACCOUNT);
        expect('creditLimit' in (found ?? {})).toBe(false);
      });

      it('updates on re-upsert instead of duplicating', async () => {
        await stores.accounts.upsertMany(USER, [{ ...ACCOUNT, balanceCurrent: 999 }]);
        const all = await stores.accounts.list(USER);
        expect(all).toHaveLength(2);
        expect(all.find((a) => a.id === ACCOUNT.id)?.balanceCurrent).toBe(999);
      });

      it('returns null for another user', async () => {
        expect(await stores.accounts.get(OTHER, 'acc_checking')).toBeNull();
      });

      it('removes only the requested user account', async () => {
        await stores.accounts.upsertMany(OTHER, [{ ...ACCOUNT }]);
        expect(await stores.accounts.remove(USER, ACCOUNT.id)).toBe(true);
        expect(await stores.accounts.get(USER, ACCOUNT.id)).toBeNull();
        expect(await stores.accounts.get(OTHER, ACCOUNT.id)).toEqual(ACCOUNT);
        expect(await stores.accounts.remove(USER, ACCOUNT.id)).toBe(false);
      });
    });

    describe('transactions', () => {
      it('round-trips every field', async () => {
        const row = txn({ providerTxnId: 'p1' });
        await stores.transactions.upsertMany(USER, [row]);
        expect(await stores.transactions.get(USER, row.id)).toEqual(row);
      });

      it('keeps amounts as numbers, not strings', async () => {
        // Postgres returns bigint as a string by default, which turns `a + b`
        // into string concatenation and every total into nonsense.
        await stores.transactions.upsertMany(USER, [txn({ providerTxnId: 'p1' })]);
        const found = await stores.transactions.get(USER, 'txn_acc_checking_p1');
        expect(typeof found?.amount).toBe('number');
        expect(found?.amount).toBe(-4_250);
      });

      it('does not shift a date across a timezone boundary', async () => {
        // The failure this guards: a `date` column parsed into a local-midnight
        // Date, so 2026-08-01 renders as 2026-07-31 west of UTC and every
        // transaction on the 1st lands in the previous month's totals.
        for (const date of ['2026-01-01', '2026-08-01', '2026-12-31', '2026-03-08']) {
          await stores.transactions.upsertMany(USER, [
            txn({ providerTxnId: `d-${date}`, postedAt: date }),
          ]);
          const found = await stores.transactions.get(USER, `txn_acc_checking_d-${date}`);
          expect(found?.postedAt).toBe(date);
        }
      });

      it('reports inserts and updates separately', async () => {
        const rows = [txn({ providerTxnId: 'p1' }), txn({ providerTxnId: 'p2' })];

        expect(await stores.transactions.upsertMany(USER, rows)).toEqual({
          inserted: 2,
          updated: 0,
        });
        expect(await stores.transactions.upsertMany(USER, rows)).toEqual({
          inserted: 0,
          updated: 2,
        });
        expect(await stores.transactions.list(USER)).toHaveLength(2);
      });

      it('is idempotent on (account, providerTxnId)', async () => {
        const rows = Array.from({ length: 50 }, (_, i) => txn({ providerTxnId: `p${i}` }));
        await stores.transactions.upsertMany(USER, rows);
        await stores.transactions.upsertMany(USER, rows);
        await stores.transactions.upsertMany(USER, rows);
        expect(await stores.transactions.list(USER)).toHaveLength(50);
      });

      it('updates a pending transaction when it settles', async () => {
        const pending = txn({ providerTxnId: 'p1', amount: -4_200, pending: true });
        await stores.transactions.upsertMany(USER, [pending]);
        await stores.transactions.upsertMany(USER, [
          { ...pending, amount: -4_650, pending: false },
        ]);

        const found = await stores.transactions.get(USER, pending.id);
        expect(found?.amount).toBe(-4_650);
        expect(found?.pending).toBe(false);
      });

      it('never reverts a user correction on re-sync', async () => {
        // The trust-breaking bug: the aggregator resends a row and silently
        // undoes the category the user set by hand.
        const row = txn({ providerTxnId: 'p1' });
        await stores.transactions.upsertMany(USER, [row]);
        await stores.transactions.update(USER, row.id, {
          categorySlug: 'groceries',
          categorySource: 'user_manual',
          categoryConfidence: 1,
        });

        await stores.transactions.upsertMany(USER, [row]);

        const found = await stores.transactions.get(USER, row.id);
        expect(found?.categorySlug).toBe('groceries');
        expect(found?.categorySource).toBe('user_manual');
      });

      it('still updates the amount of a user-corrected transaction', async () => {
        // Preserving the category must not freeze the whole row — the bank is
        // still authoritative about how much was spent.
        const row = txn({ providerTxnId: 'p1', amount: -1_000 });
        await stores.transactions.upsertMany(USER, [row]);
        await stores.transactions.update(USER, row.id, {
          categorySlug: 'groceries',
          categorySource: 'user_manual',
          categoryConfidence: 1,
        });
        await stores.transactions.upsertMany(USER, [{ ...row, amount: -2_500 }]);

        const found = await stores.transactions.get(USER, row.id);
        expect(found?.amount).toBe(-2_500);
        expect(found?.categorySlug).toBe('groceries');
      });

      it('applies a partial update without disturbing other fields', async () => {
        const row = txn({ providerTxnId: 'p1' });
        await stores.transactions.upsertMany(USER, [row]);
        const updated = await stores.transactions.update(USER, row.id, { isRecurring: true });

        expect(updated).toEqual({ ...row, isRecurring: true });
      });

      it('returns null when updating a row that does not exist', async () => {
        expect(await stores.transactions.update(USER, 'nope', { pending: true })).toBeNull();
      });

      it('sorts newest first', async () => {
        await stores.transactions.upsertMany(USER, [
          txn({ providerTxnId: 'a', postedAt: '2026-08-01' }),
          txn({ providerTxnId: 'b', postedAt: '2026-08-20' }),
          txn({ providerTxnId: 'c', postedAt: '2026-08-10' }),
        ]);
        const dates = (await stores.transactions.list(USER)).map((t) => t.postedAt);
        expect(dates).toEqual(['2026-08-20', '2026-08-10', '2026-08-01']);
      });

      it('filters by account, category, range, search, and limit', async () => {
        await stores.transactions.upsertMany(USER, [
          txn({ providerTxnId: 'a', postedAt: '2026-07-05', categorySlug: 'coffee' }),
          txn({ providerTxnId: 'b', postedAt: '2026-08-05', categorySlug: 'groceries' }),
          txn({
            providerTxnId: 'c',
            postedAt: '2026-08-15',
            accountId: 'acc_credit',
            id: 'txn_acc_credit_c',
            categorySlug: 'coffee',
            normalizedDescriptor: 'starbucks store seattle',
            rawDescriptor: 'STARBUCKS STORE 04412 SEATTLE WA',
            merchant: 'Starbucks',
          }),
        ]);

        expect(await stores.transactions.list(USER, { accountId: 'acc_credit' })).toHaveLength(1);
        expect(await stores.transactions.list(USER, { categorySlug: 'coffee' })).toHaveLength(2);
        expect(
          await stores.transactions.list(USER, {
            range: { start: '2026-08-01', end: '2026-08-31' },
          }),
        ).toHaveLength(2);
        expect(await stores.transactions.list(USER, { search: 'starbucks' })).toHaveLength(1);
        expect(await stores.transactions.list(USER, { limit: 2 })).toHaveLength(2);
      });

      it('treats a range as inclusive of both ends', async () => {
        await stores.transactions.upsertMany(USER, [
          txn({ providerTxnId: 'a', postedAt: '2026-08-01' }),
          txn({ providerTxnId: 'b', postedAt: '2026-08-31' }),
        ]);
        const found = await stores.transactions.list(USER, {
          range: { start: '2026-08-01', end: '2026-08-31' },
        });
        expect(found).toHaveLength(2);
      });

      it('matches search case-insensitively', async () => {
        await stores.transactions.upsertMany(USER, [txn({ providerTxnId: 'p1' })]);
        expect(await stores.transactions.list(USER, { search: 'BLUE BOTTLE' })).toHaveLength(1);
      });

      it('keeps users apart', async () => {
        await stores.transactions.upsertMany(USER, [txn({ providerTxnId: 'p1' })]);
        expect(await stores.transactions.list(OTHER)).toHaveLength(0);
        expect(await stores.transactions.get(OTHER, 'txn_acc_checking_p1')).toBeNull();
      });

      it('removes provider-deleted transactions without touching another user', async () => {
        const removed = txn({ providerTxnId: 'removed' });
        const kept = txn({ providerTxnId: 'kept' });
        await stores.transactions.upsertMany(USER, [removed, kept]);
        await stores.accounts.upsertMany(OTHER, [ACCOUNT]);
        await stores.transactions.upsertMany(OTHER, [removed]);
        expect(await stores.transactions.removeByProviderIds(USER, ['removed'])).toBe(1);
        expect((await stores.transactions.list(USER)).map((row) => row.providerTxnId)).toEqual([
          'kept',
        ]);
        expect(await stores.transactions.list(OTHER)).toHaveLength(1);
      });
    });

    describe('budgets', () => {
      const budget = {
        id: 'bud_restaurants',
        categorySlug: 'restaurants',
        limitAmount: 25_000,
        currency: 'USD',
        period: 'monthly' as const,
        rollover: false,
      };

      it('round-trips', async () => {
        await stores.budgets.create(USER, budget);
        expect(await stores.budgets.get(USER, budget.id)).toEqual(budget);
      });

      it('edits rather than duplicating when re-created for the same category', async () => {
        await stores.budgets.create(USER, budget);
        await stores.budgets.create(USER, { ...budget, limitAmount: 30_000 });

        const all = await stores.budgets.list(USER);
        expect(all).toHaveLength(1);
        expect(all[0]?.limitAmount).toBe(30_000);
      });

      it('removes', async () => {
        await stores.budgets.create(USER, budget);
        expect(await stores.budgets.remove(USER, budget.id)).toBe(true);
        expect(await stores.budgets.remove(USER, budget.id)).toBe(false);
        expect(await stores.budgets.list(USER)).toHaveLength(0);
      });

      it('keeps users apart', async () => {
        await stores.budgets.create(USER, budget);
        expect(await stores.budgets.list(OTHER)).toHaveLength(0);
      });
    });

    describe('rules', () => {
      const rule = {
        id: 'rule_1',
        matchType: 'contains' as const,
        pattern: 'kozy korner diner',
        categorySlug: 'restaurants',
        priority: 0,
      };

      it('round-trips', async () => {
        await stores.rules.create(USER, rule);
        expect(await stores.rules.list(USER)).toEqual([rule]);
      });

      it('orders by priority so tie-breaking is deterministic', async () => {
        await stores.rules.create(USER, { ...rule, id: 'r_low', priority: 5 });
        await stores.rules.create(USER, { ...rule, id: 'r_high', priority: 1 });
        expect((await stores.rules.list(USER)).map((r) => r.id)).toEqual(['r_high', 'r_low']);
      });

      it('removes', async () => {
        await stores.rules.create(USER, rule);
        expect(await stores.rules.remove(USER, rule.id)).toBe(true);
        expect(await stores.rules.list(USER)).toHaveLength(0);
      });

      it('keeps users apart', async () => {
        await stores.rules.create(USER, rule);
        expect(await stores.rules.list(OTHER)).toHaveLength(0);
      });
    });

    describe('goals', () => {
      const goal = {
        id: 'goal_emergency',
        name: 'Emergency fund',
        targetAmount: 500_000,
        currency: 'USD',
        targetDate: '2027-08-01',
        createdAt: '2026-08-01',
      };

      it('round-trips goals and ordered contributions', async () => {
        await stores.goals.create(USER, goal);
        await stores.goals.addContribution(USER, {
          id: 'contribution_2',
          goalId: goal.id,
          amount: 20_000,
          contributedAt: '2026-08-10',
        });
        await stores.goals.addContribution(USER, {
          id: 'contribution_1',
          goalId: goal.id,
          amount: 10_000,
          contributedAt: '2026-08-05',
        });

        expect(await stores.goals.get(USER, goal.id)).toEqual(goal);
        expect((await stores.goals.listContributions(USER, goal.id)).map((row) => row.id)).toEqual([
          'contribution_1',
          'contribution_2',
        ]);
      });

      it('cascades contributions when a goal is removed', async () => {
        await stores.goals.create(USER, goal);
        await stores.goals.addContribution(USER, {
          id: 'contribution_1',
          goalId: goal.id,
          amount: 10_000,
          contributedAt: '2026-08-05',
        });
        expect(await stores.goals.remove(USER, goal.id)).toBe(true);
        expect(await stores.goals.listContributions(USER, goal.id)).toHaveLength(0);
      });

      it('keeps users apart', async () => {
        await stores.goals.create(USER, goal);
        expect(await stores.goals.list(OTHER)).toHaveLength(0);
        expect(await stores.goals.get(OTHER, goal.id)).toBeNull();
      });
    });

    describe('notifications', () => {
      const notification = {
        id: 'notification_1',
        kind: 'budget' as const,
        title: 'Budget warning',
        message: 'You have used 75% of your budget.',
        severity: 'warning' as const,
        dedupeKey: 'budget:coffee:2026-08:75',
        readAt: null,
        createdAt: '2026-08-08T12:00:00.000Z',
      };

      it('deduplicates and marks notifications read', async () => {
        expect(await stores.notifications.upsert(USER, notification)).toBe(true);
        expect(await stores.notifications.upsert(USER, { ...notification, id: 'other' })).toBe(false);
        expect(await stores.notifications.markRead(USER, notification.id, '2026-08-08T13:00:00.000Z')).toBe(true);
        expect((await stores.notifications.list(USER))[0]?.readAt).toBe('2026-08-08T13:00:00.000Z');
      });

      it('persists preferences without touching another user', async () => {
        const defaults = await stores.notifications.getPreferences(USER);
        expect(Object.values(defaults).every(Boolean)).toBe(true);
        await stores.notifications.updatePreferences(USER, { ...defaults, budget: false });
        expect((await stores.notifications.getPreferences(USER)).budget).toBe(false);
        expect((await stores.notifications.getPreferences(OTHER)).budget).toBe(true);
      });

      it('keeps notification rows isolated', async () => {
        await stores.notifications.upsert(USER, notification);
        expect(await stores.notifications.list(OTHER)).toHaveLength(0);
      });
    });
  });
}
