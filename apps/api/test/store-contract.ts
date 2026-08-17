/**
 * One suite, run against every implementation of the store ports.
 *
 * The point of ADR-0002 is that the domain cannot tell which adapter it is
 * talking to. That only holds if the adapters actually behave identically, and
 * the differences that matter here are the quiet ones â€” a date shifted by a
 * timezone, a bigint returned as a string, a user's correction reverted on
 * re-sync. None of those throw. They just make the numbers wrong.
 *
 * So the contract is written once and executed twice.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '../src/domain/types';
import type { Reconciliation } from '../src/domain/reconciliation/types';
import type {
  AccountStore,
  BudgetStore,
  GoalStore,
  NotificationStore,
  RuleStore,
  TransactionStore,
  ReconciliationStore,
} from '../src/ports';

export interface StoreSet {
  accounts: AccountStore;
  transactions: TransactionStore;
  budgets: BudgetStore;
  goals: GoalStore;
  notifications: NotificationStore;
  rules: RuleStore;
  reconciliations: ReconciliationStore;
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
      // Accounts first â€” transactions reference them.
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

      it('records currency-safe net-worth history and replaces a same-day observation', async () => {
        expect(await stores.accounts.recordNetWorthSnapshot(USER, '2026-08-01')).toEqual([
          {
            recordedOn: '2026-08-01',
            currency: 'USD',
            assets: 384_512,
            debts: 142_300,
            netPosition: 242_212,
          },
        ]);
        await stores.accounts.upsertMany(USER, [{ ...ACCOUNT, balanceCurrent: 400_000 }]);
        await stores.accounts.recordNetWorthSnapshot(USER, '2026-08-01');
        await stores.accounts.recordNetWorthSnapshot(USER, '2026-08-02');
        expect(await stores.accounts.listNetWorthHistory(USER)).toEqual([
          expect.objectContaining({ recordedOn: '2026-08-01', netPosition: 257_700 }),
          expect.objectContaining({ recordedOn: '2026-08-02', netPosition: 257_700 }),
        ]);
        expect(await stores.accounts.listNetWorthHistory(OTHER)).toEqual([]);
      });

      it('never combines account currencies in net-worth history', async () => {
        await stores.accounts.upsertMany(USER, [{ ...ACCOUNT, id: 'acc_cad', currency: 'CAD' }]);
        const rows = await stores.accounts.recordNetWorthSnapshot(USER, '2026-08-03');
        expect(rows.map((row) => row.currency)).toEqual(['CAD', 'USD']);
        await stores.accounts.remove(USER, 'acc_cad');
        await stores.accounts.recordNetWorthSnapshot(USER, '2026-08-03');
        expect((await stores.accounts.listNetWorthHistory(USER)).map((row) => row.currency))
          .toEqual(['USD']);
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
        // Preserving the category must not freeze the whole row â€” the bank is
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
            providerTxnId: 'income',
            postedAt: '2026-08-06',
            amount: 50_000,
            categorySlug: 'salary',
          }),
          txn({
            providerTxnId: 'pending',
            postedAt: '2026-08-07',
            pending: true,
            amount: -7_500,
            categorySlug: 'groceries',
          }),
          txn({
            providerTxnId: 'recurring',
            postedAt: '2026-08-08',
            isRecurring: true,
            amount: -12_000,
            categorySlug: 'subscriptions',
          }),
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
        expect(await stores.transactions.list(USER, { categoryKind: 'income' })).toHaveLength(1);
        expect(await stores.transactions.list(USER, { pending: true })).toHaveLength(1);
        expect(await stores.transactions.list(USER, { recurring: true })).toHaveLength(1);
        expect(
          await stores.transactions.list(USER, { amountMin: 7_000, amountMax: 8_000 }),
        ).toHaveLength(1);
        expect(
          await stores.transactions.list(USER, {
            range: { start: '2026-08-01', end: '2026-08-31' },
          }),
        ).toHaveLength(5);
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

    describe('reconciliations', () => {
      /**
       * `difference` is always derived, never passed in.
       *
       * The schema enforces `difference = observed - computed`, and an earlier
       * version of this helper let a caller override one balance while leaving
       * the difference at its default — producing fixtures the database
       * correctly rejected. Deriving it here makes that mistake unrepresentable.
       */
      const assertion = (overrides: Partial<Reconciliation> = {}): Reconciliation => {
        const row = {
          id: `rec-${Math.random().toString(36).slice(2)}`,
          accountId: 'acc_checking',
          statementDate: '2026-07-31',
          observedBalance: 384_512,
          currency: 'USD',
          computedBalance: 384_512,
          source: 'statement' as const,
          note: null,
          createdAt: '2026-08-01T10:00:00.000Z',
          archivedAt: null,
          ...overrides,
        };

        return { ...row, difference: row.observedBalance - row.computedBalance };
      };

      it('round-trips every field', async () => {
        const row = assertion({ note: 'Checked against the July PDF' });
        await stores.reconciliations.create(USER, row);
        expect(await stores.reconciliations.get(USER, row.id)).toEqual(row);
      });

      it('keeps amounts as numbers, not strings', async () => {
        const row = assertion({ observedBalance: 400_000, computedBalance: 384_512 });
        await stores.reconciliations.create(USER, row);
        const found = await stores.reconciliations.get(USER, row.id);

        expect(typeof found?.observedBalance).toBe('number');
        expect(typeof found?.difference).toBe('number');
        expect(found?.difference).toBe(15_488);
      });

      it('preserves a negative difference', async () => {
        const row = assertion({ observedBalance: 380_000, computedBalance: 384_512 });
        await stores.reconciliations.create(USER, row);
        expect((await stores.reconciliations.get(USER, row.id))?.difference).toBe(-4_512);
      });

      it('does not shift the statement date across a timezone boundary', async () => {
        for (const date of ['2026-01-01', '2026-08-01', '2026-12-31']) {
          const row = assertion({ statementDate: date });
          await stores.reconciliations.create(USER, row);
          expect((await stores.reconciliations.get(USER, row.id))?.statementDate).toBe(date);
        }
      });

      it('supersedes a previous assertion for the same closing date', async () => {
        // A second observation of one date is a correction, not a second fact.
        const first = assertion({ observedBalance: 100, computedBalance: 100 });
        const second = assertion({
          observedBalance: 200,
          computedBalance: 200,
          createdAt: '2026-08-02T10:00:00.000Z',
        });

        await stores.reconciliations.create(USER, first);
        await stores.reconciliations.create(USER, second);

        const all = await stores.reconciliations.list(USER);
        const live = all.filter((r) => r.archivedAt === null);

        expect(all).toHaveLength(2);
        expect(live).toHaveLength(1);
        expect(live[0]?.observedBalance).toBe(200);
      });

      it('allows a different date on the same account', async () => {
        await stores.reconciliations.create(USER, assertion({ statementDate: '2026-06-30' }));
        await stores.reconciliations.create(USER, assertion({ statementDate: '2026-07-31' }));

        const live = (await stores.reconciliations.list(USER)).filter((r) => r.archivedAt === null);
        expect(live).toHaveLength(2);
      });

      it('allows the same date on a different account', async () => {
        await stores.reconciliations.create(USER, assertion({ accountId: 'acc_checking' }));
        await stores.reconciliations.create(
          USER,
          assertion({
            accountId: 'acc_credit',
            observedBalance: -142_300,
            computedBalance: -142_300,
          }),
        );

        const live = (await stores.reconciliations.list(USER)).filter((r) => r.archivedAt === null);
        expect(live).toHaveLength(2);
      });

      it('filters by account', async () => {
        await stores.reconciliations.create(USER, assertion({ accountId: 'acc_checking' }));
        await stores.reconciliations.create(
          USER,
          assertion({ accountId: 'acc_credit', observedBalance: -1, computedBalance: -1 }),
        );

        const forCard = await stores.reconciliations.list(USER, 'acc_credit');
        expect(forCard).toHaveLength(1);
        expect(forCard[0]?.accountId).toBe('acc_credit');
      });

      it('lists newest statement date first', async () => {
        await stores.reconciliations.create(USER, assertion({ statementDate: '2026-05-31' }));
        await stores.reconciliations.create(USER, assertion({ statementDate: '2026-07-31' }));
        await stores.reconciliations.create(USER, assertion({ statementDate: '2026-06-30' }));

        expect((await stores.reconciliations.list(USER)).map((r) => r.statementDate)).toEqual([
          '2026-07-31',
          '2026-06-30',
          '2026-05-31',
        ]);
      });

      it('archives rather than deletes', async () => {
        // An audit trail you can erase is not one.
        const row = assertion();
        await stores.reconciliations.create(USER, row);

        expect(
          await stores.reconciliations.archive(USER, row.id, '2026-08-05T00:00:00.000Z'),
        ).toBe(true);

        const found = await stores.reconciliations.get(USER, row.id);
        expect(found).not.toBeNull();
        expect(found?.archivedAt).toBe('2026-08-05T00:00:00.000Z');
      });

      it('will not archive twice', async () => {
        const row = assertion();
        await stores.reconciliations.create(USER, row);
        await stores.reconciliations.archive(USER, row.id, '2026-08-05T00:00:00.000Z');
        expect(
          await stores.reconciliations.archive(USER, row.id, '2026-08-06T00:00:00.000Z'),
        ).toBe(false);
      });

      it('frees the closing date once archived', async () => {
        const first = assertion();
        await stores.reconciliations.create(USER, first);
        await stores.reconciliations.archive(USER, first.id, '2026-08-05T00:00:00.000Z');

        await expect(
          stores.reconciliations.create(
            USER,
            assertion({ observedBalance: 999, computedBalance: 999 }),
          ),
        ).resolves.toBeTruthy();
      });

      it('keeps users apart', async () => {
        const row = assertion();
        await stores.reconciliations.create(USER, row);

        expect(await stores.reconciliations.list(OTHER)).toHaveLength(0);
        expect(await stores.reconciliations.get(OTHER, row.id)).toBeNull();
        expect(
          await stores.reconciliations.archive(OTHER, row.id, '2026-08-05T00:00:00.000Z'),
        ).toBe(false);
      });
    });
  });
}
