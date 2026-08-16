import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ClockPort } from '../src/ports';
import { InMemorySplitStore } from '../src/infra/in-memory-store';
import { InMemoryUserStore } from '../src/infra/auth/in-memory-auth-stores';
import { SplitService } from '../src/modules/split/split.service';
import { PostgresSplitStore } from '../src/infra/postgres/stores';
import { closePool } from '../src/infra/postgres/pool';
import { withUserScope } from '../src/infra/postgres/pool';
import { startPgHarness } from './pg-harness';

const clock: ClockPort = {
  today: () => '2026-08-10',
  now: () => new Date('2026-08-10T12:00:00.000Z'),
};

async function makeUsers(store: InMemoryUserStore): Promise<void> {
  await store.create({ id: 'split_alice', email: 'alice@example.com', passwordHash: 'x', displayName: null });
  await store.create({ id: 'split_bob', email: 'bob@example.com', passwordHash: 'x', displayName: null });
  await store.create({ id: 'split_mallory', email: 'mallory@example.com', passwordHash: 'x', displayName: null });
}

describe('split service (in-memory)', () => {
  let service: SplitService;
  let users: InMemoryUserStore;

  beforeEach(async () => {
    users = new InMemoryUserStore();
    await makeUsers(users);
    service = new SplitService(new InMemorySplitStore(), users, clock);
  });

  it('creates a group, adds a member by email, and shares an expense', async () => {
    const group = await service.createGroup('split_alice', { name: 'Road trip', currency: 'USD' });
    await service.addMember('split_alice', group.id, { email: 'bob@example.com' });

    const expense = await service.addExpense('split_alice', group.id, {
      description: 'Fuel',
      amount: 6_000,
    });

    expect(expense.participants).toHaveLength(2);
    expect(expense.participants.reduce((sum, p) => sum + p.amount, 0)).toBe(6_000);

    const detail = await service.groupDetail('split_alice', group.id);
    expect(detail.members).toHaveLength(2);
    expect(detail.balances.find((balance) => balance.userId === 'split_alice')?.netAmount).toBe(3_000);
    expect(detail.balances.find((balance) => balance.userId === 'split_bob')?.netAmount).toBe(-3_000);
  });

  it('supports explicit shares and settles up', async () => {
    const group = await service.createGroup('split_alice', { name: 'Rent', currency: 'USD' });
    await service.addMember('split_alice', group.id, { email: 'bob@example.com' });

    await service.addExpense('split_alice', group.id, {
      description: 'Rent',
      amount: 100_000,
      splitMethod: 'shares',
      shares: [
        { userId: 'split_alice', amount: 40_000 },
        { userId: 'split_bob', amount: 60_000 },
      ],
    });

    await service.addSettlement('split_bob', group.id, {
      toUserId: 'split_alice',
      amount: 10_000,
    });

    const detail = await service.groupDetail('split_alice', group.id);
    expect(detail.balances.find((balance) => balance.userId === 'split_bob')?.netAmount).toBe(-70_000);
  });

  it('refuses to add a member who has no FINVERSE account', async () => {
    const group = await service.createGroup('split_alice', { name: 'Trip' });
    await expect(
      service.addMember('split_alice', group.id, { email: 'nobody@example.com' }),
    ).rejects.toThrow(/No FINVERSE account/);
  });

  it('keeps non-members out of a group', async () => {
    const group = await service.createGroup('split_alice', { name: 'Private' });
    await expect(service.groupDetail('split_mallory', group.id)).rejects.toThrow(/not found/i);
  });

  it('only the creator can archive a group', async () => {
    const group = await service.createGroup('split_alice', { name: 'Trip' });
    await service.addMember('split_alice', group.id, { email: 'bob@example.com' });
    await expect(service.archiveGroup('split_bob', group.id)).rejects.toThrow(/creator/);
    await expect(service.archiveGroup('split_alice', group.id)).resolves.toBeUndefined();
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  describe('split store: postgres RLS', () => {
    let harness: Awaited<ReturnType<typeof startPgHarness>>;
    let store: PostgresSplitStore;

    beforeAll(async () => {
      harness = await startPgHarness(TEST_DATABASE_URL);
      store = new PostgresSplitStore(harness.app);
    });

    afterAll(async () => {
      await harness.close();
      await closePool();
    });

    beforeEach(async () => {
      await harness.owner.query('DELETE FROM users');
      await harness.owner.query(
        "INSERT INTO users (id, email) VALUES ('split_alice','alice@example.com'),('split_bob','bob@example.com'),('split_mallory','mallory@example.com')",
      );
    });

    it('lets members read a group but hides it from everyone else', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group',
          name: 'Trip',
          currency: 'USD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );
      await store.addMember('split_alice', {
        groupId: 'pg-group',
        userId: 'split_bob',
        role: 'member',
        joinedAt: '2026-08-10T00:00:00.000Z',
      });

      expect(await store.listGroups('split_alice')).toHaveLength(1);
      expect(await store.listGroups('split_bob')).toHaveLength(1);
      expect(await store.listGroups('split_mallory')).toHaveLength(0);
      expect(await store.getGroup('split_mallory', 'pg-group')).toBeNull();
    });

    it('scopes an unfiltered query to the acting user via the policy', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group-2',
          name: 'Rent',
          currency: 'CAD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group-2', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );

      const asAlice = await withUserScope(harness.app, 'split_alice', (client) =>
        client.query('SELECT count(*)::int AS n FROM split_groups'),
      );
      const asMallory = await withUserScope(harness.app, 'split_mallory', (client) =>
        client.query('SELECT count(*)::int AS n FROM split_groups'),
      );
      expect(asAlice.rows[0]?.n).toBe(1);
      expect(asMallory.rows[0]?.n).toBe(0);
    });

    it('round-trips expenses with participants and settlements', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group-3',
          name: 'Dinner',
          currency: 'USD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group-3', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );
      await store.addMember('split_alice', {
        groupId: 'pg-group-3',
        userId: 'split_bob',
        role: 'member',
        joinedAt: '2026-08-10T00:00:00.000Z',
      });

      await store.addExpense('split_alice', {
        id: 'pg-expense',
        groupId: 'pg-group-3',
        description: 'Dinner',
        category: 'restaurants',
        amount: 10_000,
        currency: 'USD',
        paidByUserId: 'split_alice',
        splitMethod: 'equal',
        date: '2026-08-10',
        createdAt: '2026-08-10T12:00:00.000Z',
        participants: [
          { expenseId: 'pg-expense', userId: 'split_alice', amount: 5_000 },
          { expenseId: 'pg-expense', userId: 'split_bob', amount: 5_000 },
        ],
      });
      await store.addSettlement('split_bob', {
        id: 'pg-settlement',
        groupId: 'pg-group-3',
        fromUserId: 'split_bob',
        toUserId: 'split_alice',
        amount: 2_000,
        currency: 'USD',
        note: 'covering my share',
        createdAt: '2026-08-11T00:00:00.000Z',
      });

      const expenses = await store.listExpenses('split_bob', 'pg-group-3');
      expect(expenses).toHaveLength(1);
      expect(expenses[0]?.participants).toHaveLength(2);
      const settlements = await store.listSettlements('split_alice', 'pg-group-3');
      expect(settlements).toHaveLength(1);
      expect(settlements[0]?.amount).toBe(2_000);
      expect(await store.listExpenses('split_mallory', 'pg-group-3')).toHaveLength(0);
    });
  });
} else {
  describe('split store: postgres RLS', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
