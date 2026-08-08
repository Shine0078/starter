import { Global, Logger, Module, type Provider } from '@nestjs/common';

import { loadConfig } from '../config';
import { SystemClock } from '../infra/clock';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../infra/in-memory-store';
import { MockAggregator } from '../infra/mock-aggregator';
import { getPool } from '../infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
  PostgresRuleStore,
  PostgresTransactionStore,
} from '../infra/postgres/stores';
import {
  ACCOUNT_STORE,
  AGGREGATOR,
  BUDGET_STORE,
  CLOCK,
  RULE_STORE,
  TRANSACTION_STORE,
} from '../ports';

/**
 * Composition root. The only file that decides which adapter satisfies which
 * port (ADR-0002).
 *
 * Swapping persistence is this function and nothing else — no domain code, no
 * controller, and no service knows which of the two is running.
 */
function storeProviders(): Provider[] {
  const config = loadConfig();
  const logger = new Logger('CoreModule');

  if (config.store === 'memory') {
    logger.warn('Using the in-memory store — all data is lost on restart. Set DATABASE_URL to persist.');
    return [
      { provide: ACCOUNT_STORE, useClass: InMemoryAccountStore },
      { provide: TRANSACTION_STORE, useClass: InMemoryTransactionStore },
      { provide: BUDGET_STORE, useClass: InMemoryBudgetStore },
      { provide: RULE_STORE, useClass: InMemoryRuleStore },
    ];
  }

  logger.log('Using Postgres for persistence.');
  const pool = getPool(config.databaseUrl);

  return [
    { provide: ACCOUNT_STORE, useFactory: () => new PostgresAccountStore(pool) },
    { provide: TRANSACTION_STORE, useFactory: () => new PostgresTransactionStore(pool) },
    { provide: BUDGET_STORE, useFactory: () => new PostgresBudgetStore(pool) },
    { provide: RULE_STORE, useFactory: () => new PostgresRuleStore(pool) },
  ];
}

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: AGGREGATOR,
      useFactory: () => new MockAggregator({ today: new SystemClock().today() }),
    },
    ...storeProviders(),
  ],
  exports: [CLOCK, ACCOUNT_STORE, TRANSACTION_STORE, BUDGET_STORE, RULE_STORE, AGGREGATOR],
})
export class CoreModule {}
