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

async function inviteAndAccept(service: SplitService, groupId: string, email: string, userId: string) {
  const invitation = await service.createInvitation('split_alice', groupId, { email });
  await service.acceptInvitation(userId, invitation.id);
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
    await inviteAndAccept(service, group.id, 'bob@example.com', 'split_bob');

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
    await inviteAndAccept(service, group.id, 'bob@example.com', 'split_bob');

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
    expect(detail.balances.find((balance) => balance.userId === 'split_bob')?.netAmount).toBe(-50_000);
  });

  it('refuses to add a member who has no FINVERSE account', async () => {
    const group = await service.createGroup('split_alice', { name: 'Trip' });
    await expect(
      service.createInvitation('split_alice', group.id, { email: 'nobody@example.com' }),
    ).rejects.toThrow(/Unable to add that account/);
  });

  it('requires invitee consent and supports decline/revoke transitions', async () => {
    const group = await service.createGroup('split_alice', { name: 'Consent' });
    const invitation = await service.createInvitation('split_alice', group.id, {
      email: 'bob@example.com',
    });
    expect(await service.listInvitations('split_bob')).toHaveLength(1);
    expect((await service.groupDetail('split_alice', group.id)).members).toHaveLength(1);
    await service.declineInvitation('split_bob', invitation.id);
    expect(await service.listInvitations('split_bob')).toHaveLength(0);

    const second = await service.createInvitation('split_alice', group.id, {
      email: 'bob@example.com',
    });
    await service.revokeInvitation('split_alice', group.id, second.id);
    await expect(service.acceptInvitation('split_bob', second.id)).rejects.toThrow(/not found/i);
  });

  it('only removes a member after their balance reaches zero', async () => {
    const group = await service.createGroup('split_alice', { name: 'Removal' });
    await inviteAndAccept(service, group.id, 'bob@example.com', 'split_bob');
    await service.addExpense('split_alice', group.id, { description: 'Dinner', amount: 1000 });
    await expect(service.removeMember('split_alice', group.id, 'split_bob')).rejects.toThrow(/settle/i);

    await service.addSettlement('split_bob', group.id, { toUserId: 'split_alice', amount: 500 });
    await expect(service.removeMember('split_bob', group.id, 'split_bob')).resolves.toBeUndefined();
    expect((await service.groupDetail('split_alice', group.id)).members.map((m) => m.userId)).toEqual(['split_alice']);
    await expect(service.removeMember('split_alice', group.id, 'split_alice')).rejects.toThrow(/creator/i);
  });

  it('restricts membership changes to admins and payer attribution to the actor', async () => {
    const group = await service.createGroup('split_alice', { name: 'Trip' });
    await inviteAndAccept(service, group.id, 'bob@example.com', 'split_bob');

    await expect(
      service.createInvitation('split_bob', group.id, { email: 'mallory@example.com' }),
    ).rejects.toThrow(/administrator/);
    await expect(
      service.addExpense('split_bob', group.id, {
        description: 'Forged payer',
        amount: 100,
        paidByUserId: 'split_alice',
      }),
    ).rejects.toThrow(/authenticated member/);
  });

  it('keeps non-members out of a group', async () => {
    const group = await service.createGroup('split_alice', { name: 'Private' });
    await expect(service.groupDetail('split_mallory', group.id)).rejects.toThrow(/not found/i);
  });

  it('only the creator can archive a group', async () => {
    const group = await service.createGroup('split_alice', { name: 'Trip' });
    await inviteAndAccept(service, group.id, 'bob@example.com', 'split_bob');
    await expect(service.archiveGroup('split_bob', group.id)).rejects.toThrow(/creator/);
    await expect(service.archiveGroup('split_alice', group.id)).resolves.toBeUndefined();
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  describe('split store: postgres RLS', () => {
    let harness: Awaited<ReturnType<typeof startPgHarness>>;
    let store: PostgresSplitStore;

    async function inviteAndAcceptStore(groupId: string, userId = 'split_bob') {
      const invitation = await store.createInvitation('split_alice', {
        id: `invite-${groupId}-${userId}`,
        groupId,
        inviteeUserId: userId,
        invitedByUserId: 'split_alice',
        status: 'pending',
        createdAt: '2026-08-10T00:00:00.000Z',
        decidedAt: null,
      });
      await store.acceptInvitation(userId, invitation.id);
    }

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
      await inviteAndAcceptStore('pg-group');

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

    it('persists invitation context and consumes consent atomically', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group-invite',
          name: 'Consent trip',
          currency: 'CAD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group-invite', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );
      const invitation = await store.createInvitation('split_alice', {
        id: 'pg-invitation',
        groupId: 'pg-group-invite',
        inviteeUserId: 'split_bob',
        invitedByUserId: 'split_alice',
        status: 'pending',
        createdAt: '2026-08-10T00:00:00.000Z',
        decidedAt: null,
      });
      expect(invitation.groupName).toBe('Consent trip');
      expect((await store.listInvitations('split_bob'))[0]?.invitedByEmail).toBe('alice@example.com');
      expect(await store.listGroups('split_bob')).toHaveLength(0);
      expect((await store.acceptInvitation('split_bob', invitation.id))?.userId).toBe('split_bob');
      expect(await store.listGroups('split_bob')).toHaveLength(1);
      expect((await store.listInvitations('split_bob'))).toHaveLength(0);
    });

    it('removes only a zero-balance member and records the departure', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group-remove',
          name: 'Removal',
          currency: 'USD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group-remove', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );
      const invitation = await store.createInvitation('split_alice', {
        id: 'pg-invitation-remove',
        groupId: 'pg-group-remove',
        inviteeUserId: 'split_bob',
        invitedByUserId: 'split_alice',
        status: 'pending',
        createdAt: '2026-08-10T00:00:00.000Z',
        decidedAt: null,
      });
      await store.acceptInvitation('split_bob', invitation.id);
      await store.addExpense('split_alice', {
        id: 'pg-expense-remove',
        groupId: 'pg-group-remove',
        description: 'Dinner',
        category: 'other',
        amount: 1000,
        currency: 'USD',
        paidByUserId: 'split_alice',
        splitMethod: 'equal',
        date: '2026-08-10',
        createdAt: '2026-08-10T12:00:00.000Z',
        participants: [
          { expenseId: 'pg-expense-remove', userId: 'split_alice', amount: 500 },
          { expenseId: 'pg-expense-remove', userId: 'split_bob', amount: 500 },
        ],
      });
      expect(await store.removeMember('split_alice', 'pg-group-remove', 'split_bob')).toBe('balance_nonzero');
      await store.addSettlement('split_bob', {
        id: 'pg-settlement-remove',
        groupId: 'pg-group-remove',
        fromUserId: 'split_bob',
        toUserId: 'split_alice',
        amount: 500,
        currency: 'USD',
        note: '',
        createdAt: '2026-08-10T13:00:00.000Z',
      });
      expect(await store.removeMember('split_bob', 'pg-group-remove', 'split_bob')).toBe('removed');
      expect((await store.listMembers('split_alice', 'pg-group-remove')).map((m) => m.userId)).toEqual(['split_alice']);
      const { rows: invitationState } = await harness.owner.query(
        'SELECT status FROM split_group_invitations WHERE id = $1',
        [invitation.id],
      );
      expect(invitationState).toEqual([{ status: 'left' }]);
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
      await inviteAndAcceptStore('pg-group-3');

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

    it('blocks non-admin membership writes and forged payer attribution under forced RLS', async () => {
      await store.createGroup(
        'split_alice',
        {
          id: 'pg-group-4',
          name: 'Authorization',
          currency: 'USD',
          createdBy: 'split_alice',
          createdAt: '2026-08-10',
          archivedAt: null,
        },
        { groupId: 'pg-group-4', userId: 'split_alice', role: 'admin', joinedAt: '2026-08-10T00:00:00.000Z' },
      );
      await inviteAndAcceptStore('pg-group-4');

      await expect(
        withUserScope(harness.app, 'split_bob', (client) =>
          client.query(
            `INSERT INTO split_group_members (group_id, user_id, role)
             VALUES ('pg-group-4', 'split_mallory', 'member')`,
          ),
        ),
      ).rejects.toThrow();

      await expect(
        store.addExpense('split_bob', {
          id: 'pg-expense-forged',
          groupId: 'pg-group-4',
          description: 'Forged payer',
          category: 'other',
          amount: 100,
          currency: 'USD',
          paidByUserId: 'split_alice',
          splitMethod: 'equal',
          date: '2026-08-10',
          createdAt: '2026-08-10T12:00:00.000Z',
          participants: [{ expenseId: 'pg-expense-forged', userId: 'split_bob', amount: 100 }],
        }),
      ).rejects.toThrow();
    });
  });
} else {
  describe('split store: postgres RLS', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
