import { describe, it } from 'vitest';

import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../src/infra/in-memory-store';
import { runMigrations } from '../src/infra/postgres/migrate';
import { closePool, getPool } from '../src/infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
  PostgresRuleStore,
  PostgresTransactionStore,
} from '../src/infra/postgres/stores';
import { runStoreContract, type StoreSet } from './store-contract';

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
  runStoreContract('postgres', async (): Promise<StoreSet> => {
    const pool = getPool(TEST_DATABASE_URL);
    await runMigrations(pool);

    return {
      accounts: new PostgresAccountStore(pool),
      transactions: new PostgresTransactionStore(pool),
      budgets: new PostgresBudgetStore(pool),
      rules: new PostgresRuleStore(pool),
      async reset() {
        // Deleting the users cascades to everything else, which also proves
        // the FK cascade that account deletion depends on actually works.
        await pool.query('DELETE FROM users');
      },
      async teardown() {
        await closePool();
      },
    };
  });
} else {
  describe('store contract: postgres', () => {
    it.skip('needs TEST_DATABASE_URL — run `npm run infra:up` first', () => {});
  });
}
