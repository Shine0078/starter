import { describe, it } from 'vitest';

import {
  InMemoryAuthActionTokenStore,
  PostgresAuthActionTokenStore,
} from '../src/infra/auth/auth-action-stores';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../src/infra/in-memory-store';
import { closePool } from '../src/infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
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
    async reset() {
      accounts = new InMemoryAccountStore();
      transactions = new InMemoryTransactionStore();
      budgets = new InMemoryBudgetStore();
      rules = new InMemoryRuleStore();
    },
    async teardown() {},
  };

  return set;
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
      async reset() {
        // Deleting the users cascades to everything else, which also proves
        // the FK cascade that account deletion depends on actually works.
        // Cascades run as referential integrity checks, which bypass RLS —
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
    // Identity carries no policies — login and lockout counting have to read
    // these tables before there is a user to scope to — but the runtime role
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
    it.skip('needs TEST_DATABASE_URL — run `npm run test:db`', () => {});
  });
}
