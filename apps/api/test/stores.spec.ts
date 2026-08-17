import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  InMemoryAuthActionTokenStore,
  PostgresAuthActionTokenStore,
} from '../src/infra/auth/auth-action-stores';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryGoalStore,
  InMemoryNotificationStore,
  InMemoryReconciliationStore,
  InMemorySavedViewStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../src/infra/in-memory-store';
import { closePool } from '../src/infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
  PostgresGoalStore,
  PostgresNotificationStore,
  PostgresReconciliationStore,
  PostgresSavedViewStore,
  PostgresRuleStore,
  PostgresTransactionStore,
} from '../src/infra/postgres/stores';
import {
  InMemoryAuthEventStore,
  InMemorySessionStore,
  InMemoryUserStore,
} from '../src/infra/auth/in-memory-auth-stores';
import {
  PostgresAuthEventStore,
  PostgresSessionStore,
  PostgresUserStore,
} from '../src/infra/auth/postgres-auth-stores';
import { runAuthStoreContract, type AuthStoreSet } from './auth-store-contract';
import { startPgHarness } from './pg-harness';
import { runStoreContract, type StoreSet } from './store-contract';
import { InMemoryConsentStore, PostgresConsentStore } from '../src/infra/privacy/consent-stores';
import {
  InMemoryRegistrationStore,
  PostgresRegistrationStore,
} from '../src/infra/auth/registration-stores';

// ------------------------------------------------- in-memory identity stores

runAuthStoreContract('in-memory', async (): Promise<AuthStoreSet> => {
  let users = new InMemoryUserStore();
  let sessions = new InMemorySessionStore();
  let events = new InMemoryAuthEventStore();
  let actions = new InMemoryAuthActionTokenStore();

  return {
    get users() {
      return users;
    },
    get sessions() {
      return sessions;
    },
    get events() {
      return events;
    },
    get actions() {
      return actions;
    },
    async reset() {
      users = new InMemoryUserStore();
      sessions = new InMemorySessionStore();
      events = new InMemoryAuthEventStore();
      actions = new InMemoryAuthActionTokenStore();
    },
    async teardown() {},
  };
});

// ---------------------------------------------------------------- in-memory

runStoreContract('in-memory', async (): Promise<StoreSet> => {
  let accounts = new InMemoryAccountStore();
  let transactions = new InMemoryTransactionStore();
  let budgets = new InMemoryBudgetStore();
  let rules = new InMemoryRuleStore();
  let goals = new InMemoryGoalStore();
  let notifications = new InMemoryNotificationStore();
  let reconciliations = new InMemoryReconciliationStore();
  let savedViews = new InMemorySavedViewStore();

  const set: StoreSet = {
    get accounts() {
      return accounts;
    },
    get transactions() {
      return transactions;
    },
    get budgets() {
      return budgets;
    },
    get rules() {
      return rules;
    },
    get goals() {
      return goals;
    },
    get notifications() {
      return notifications;
    },
    get reconciliations() {
      return reconciliations;
    },
    get savedViews() {
      return savedViews;
    },
    async reset() {
      accounts = new InMemoryAccountStore();
      transactions = new InMemoryTransactionStore();
      budgets = new InMemoryBudgetStore();
      rules = new InMemoryRuleStore();
      goals = new InMemoryGoalStore();
      notifications = new InMemoryNotificationStore();
      reconciliations = new InMemoryReconciliationStore();
      savedViews = new InMemorySavedViewStore();
    },
    async teardown() {},
  };

  return set;
});

describe('consent store: in-memory', () => {
  let store: InMemoryConsentStore;

  beforeEach(() => {
    store = new InMemoryConsentStore();
  });

  it('keeps append-only choices ordered and users isolated', async () => {
    await store.record('alice', {
      id: 'consent-1',
      userId: 'alice',
      kind: 'analytics',
      granted: true,
      policyVersion: 'preference-v1',
      source: 'user_settings',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    });
    await store.record('alice', {
      id: 'consent-2',
      userId: 'alice',
      kind: 'analytics',
      granted: false,
      policyVersion: 'preference-v1',
      source: 'user_settings',
      createdAt: new Date('2026-08-02T00:00:00Z'),
    });
    expect((await store.list('alice')).map((event) => event.granted)).toEqual([false, true]);
    expect(await store.list('bob')).toEqual([]);
  });

  it('creates a user with legal evidence and rolls both back on failure', async () => {
    const users = new InMemoryUserStore();
    const registrations = new InMemoryRegistrationStore(users, store);
    const input = {
      id: 'registered-alice',
      email: 'registered@example.com',
      passwordHash: 'hash',
      displayName: null,
    };
    const event = {
      id: 'registration-consent-1',
      userId: input.id,
      kind: 'terms' as const,
      granted: true,
      policyVersion: 'terms-v1',
      source: 'registration' as const,
      createdAt: new Date('2026-08-08T00:00:00Z'),
    };

    await registrations.create(input, [event]);
    expect(await users.findByEmail(input.email)).not.toBeNull();
    expect(await store.list(input.id)).toHaveLength(1);

    await expect(
      registrations.create(
        { ...input, id: 'rolled-back', email: 'rollback@example.com' },
        [{ ...event, id: 'bad-owner', userId: 'someone-else' }],
      ),
    ).rejects.toThrow(/owner/i);
    expect(await users.findByEmail('rollback@example.com')).toBeNull();
    expect(await store.list('rolled-back')).toEqual([]);
  });
});

// ----------------------------------------------------------------- postgres

/**
 * Runs only when TEST_DATABASE_URL is set, so `npm test` stays fast and
 * dependency-free on a machine with no database.
 *
 *   npm run infra:up
 *   TEST_DATABASE_URL=postgresql://finverse:finverse_dev_only@localhost:5432/finverse npm test
 *
 * It is not skipped silently: the placeholder below reports why, because a
 * suite that quietly vanishes is one nobody notices has stopped running.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  describe('consent store: postgres', () => {
    let harness: Awaited<ReturnType<typeof startPgHarness>>;
    let store: PostgresConsentStore;
    let registrations: PostgresRegistrationStore;

    beforeAll(async () => {
      harness = await startPgHarness(TEST_DATABASE_URL);
      store = new PostgresConsentStore(harness.app);
      registrations = new PostgresRegistrationStore(harness.app);
    });

    afterAll(async () => {
      await harness.close();
      await closePool();
    });

    beforeEach(async () => {
      await harness.owner.query("DELETE FROM users WHERE id IN ('consent_alice','consent_bob')");
      await harness.owner.query("DELETE FROM users WHERE email IN ('registered-pg@example.com','rollback-pg@example.com')");
      await harness.owner.query("INSERT INTO users (id) VALUES ('consent_alice'),('consent_bob')");
    });

    it('round-trips append-only choices through the restricted role', async () => {
      await store.record('consent_alice', {
        id: 'consent-pg-1',
        userId: 'consent_alice',
        kind: 'product_updates',
        granted: true,
        policyVersion: 'preference-v1',
        source: 'user_settings',
        createdAt: new Date('2026-08-01T00:00:00Z'),
      });
      expect((await store.list('consent_alice'))[0]?.granted).toBe(true);
      expect(await store.list('consent_bob')).toEqual([]);
    });

    it('atomically creates the user and legal evidence through the restricted role', async () => {
      const input = {
        id: 'registered-pg',
        email: 'registered-pg@example.com',
        passwordHash: 'hash',
        displayName: null,
      };
      await registrations.create(input, [
        {
          id: 'registration-pg-consent',
          userId: input.id,
          kind: 'privacy_notice',
          granted: true,
          policyVersion: 'privacy-v1',
          source: 'registration',
          createdAt: new Date('2026-08-08T00:00:00Z'),
        },
      ]);
      expect((await store.list(input.id))[0]?.policyVersion).toBe('privacy-v1');

      await expect(
        registrations.create(
          {
            id: 'rollback-pg',
            email: 'rollback-pg@example.com',
            passwordHash: 'hash',
            displayName: null,
          },
          [
            {
              id: 'registration-pg-bad-owner',
              userId: 'someone-else',
              kind: 'terms',
              granted: true,
              policyVersion: 'terms-v1',
              source: 'registration',
              createdAt: new Date('2026-08-08T00:00:00Z'),
            },
          ],
        ),
      ).rejects.toThrow(/owner/i);
      const rolledBack = await harness.owner.query(
        "SELECT id FROM users WHERE email = 'rollback-pg@example.com'",
      );
      expect(rolledBack.rowCount).toBe(0);
    });
  });

  // Note which pool goes where: the stores under test get the restricted
  // runtime role, so the whole contract runs with the RLS policies in force,
  // while reset() uses the owner. Handing the stores the owner's pool would
  // make this suite pass just as happily against a database with no policies.
  runStoreContract('postgres', async (): Promise<StoreSet> => {
    const { owner, app, close } = await startPgHarness(TEST_DATABASE_URL);

    return {
      accounts: new PostgresAccountStore(app),
      transactions: new PostgresTransactionStore(app),
      budgets: new PostgresBudgetStore(app),
      rules: new PostgresRuleStore(app),
      goals: new PostgresGoalStore(app),
      notifications: new PostgresNotificationStore(app),
      reconciliations: new PostgresReconciliationStore(app),
      savedViews: new PostgresSavedViewStore(app),
      async reset() {
        // Deleting the users cascades to everything else, which also proves
        // the FK cascade that account deletion depends on actually works.
        // Cascades run as referential integrity checks, which bypass RLS â€”
        // otherwise this would silently clear nothing.
        await owner.query('DELETE FROM users');
      },
      async teardown() {
        await close();
        await closePool();
      },
    };
  });
  runAuthStoreContract('postgres', async (): Promise<AuthStoreSet> => {
    // Identity carries no policies â€” login and lockout counting have to read
    // these tables before there is a user to scope to â€” but the runtime role
    // still has to hold the right grants, so it is used here too.
    const { owner, app, close } = await startPgHarness(TEST_DATABASE_URL);

    return {
      users: new PostgresUserStore(app),
      sessions: new PostgresSessionStore(app),
      events: new PostgresAuthEventStore(app),
      actions: new PostgresAuthActionTokenStore(app),
      async reset() {
        // auth_events references users with ON DELETE SET NULL, so rows that
        // recorded a failure against an unknown address survive the cascade
        // and have to be cleared explicitly.
        await owner.query('DELETE FROM auth_events');
        await owner.query('DELETE FROM users');
      },
      async teardown() {
        await close();
        await closePool();
      },
    };
  });
} else {
  describe('store contract: postgres', () => {
    it.skip('needs TEST_DATABASE_URL â€” run `npm run test:db`', () => {});
  });
}
