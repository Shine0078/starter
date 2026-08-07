import { Global, Module } from '@nestjs/common';

import { SystemClock } from '../infra/clock';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../infra/in-memory-store';
import { MockAggregator } from '../infra/mock-aggregator';
import { ACCOUNT_STORE, AGGREGATOR, BUDGET_STORE, CLOCK, RULE_STORE, TRANSACTION_STORE } from '../ports';

/**
 * Composition root. The only file that decides which adapter satisfies which
 * port — swapping in Postgres or a real aggregator is an edit here and nowhere
 * else (ADR-0002).
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ACCOUNT_STORE, useClass: InMemoryAccountStore },
    { provide: TRANSACTION_STORE, useClass: InMemoryTransactionStore },
    { provide: BUDGET_STORE, useClass: InMemoryBudgetStore },
    { provide: RULE_STORE, useClass: InMemoryRuleStore },
    {
      provide: AGGREGATOR,
      useFactory: () => new MockAggregator({ today: new SystemClock().today() }),
    },
  ],
  exports: [CLOCK, ACCOUNT_STORE, TRANSACTION_STORE, BUDGET_STORE, RULE_STORE, AGGREGATOR],
})
export class CoreModule {}
