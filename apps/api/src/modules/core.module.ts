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
import { getAppPool } from '../infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
  PostgresRuleStore,
  PostgresTransactionStore,
} from '../infra/postgres/stores';
import { Argon2PasswordHasher } from '../infra/auth/argon2-hasher';
import {
  InMemoryAuthEventStore,
  InMemorySessionStore,
  InMemoryUserStore,
} from '../infra/auth/in-memory-auth-stores';
import { JwtTokenIssuer } from '../infra/auth/jwt-issuer';
import {
  PostgresAuthEventStore,
  PostgresSessionStore,
  PostgresUserStore,
} from '../infra/auth/postgres-auth-stores';
import {
  ACCOUNT_STORE,
  AGGREGATOR,
  BUDGET_STORE,
  CLOCK,
  RULE_STORE,
  TRANSACTION_STORE,
} from '../ports';
import {
  AUTH_EVENT_STORE,
  PASSWORD_HASHER,
  SESSION_STORE,
  TOKEN_ISSUER,
  USER_STORE,
} from '../ports/auth';

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
      { provide: USER_STORE, useClass: InMemoryUserStore },
      { provide: SESSION_STORE, useClass: InMemorySessionStore },
      { provide: AUTH_EVENT_STORE, useClass: InMemoryAuthEventStore },
    ];
  }

  logger.log('Using Postgres for persistence.');

  // Requests are served by the least-privileged role, never by the schema
  // owner. That distinction is what makes the RLS policies in 003_rls.sql do
  // anything: a superuser bypasses every one of them, and says nothing.
  if (!config.appDatabaseUrl) {
    logger.warn(
      'DATABASE_APP_URL is not set — serving requests as the schema owner. ' +
        'Row-level security does not apply to a superuser, so user isolation ' +
        'rests on application code alone.',
    );
  }
  const pool = getAppPool(config.appDatabaseUrl);

  return [
    { provide: ACCOUNT_STORE, useFactory: () => new PostgresAccountStore(pool) },
    { provide: TRANSACTION_STORE, useFactory: () => new PostgresTransactionStore(pool) },
    { provide: BUDGET_STORE, useFactory: () => new PostgresBudgetStore(pool) },
    { provide: RULE_STORE, useFactory: () => new PostgresRuleStore(pool) },
    { provide: USER_STORE, useFactory: () => new PostgresUserStore(pool) },
    { provide: SESSION_STORE, useFactory: () => new PostgresSessionStore(pool) },
    { provide: AUTH_EVENT_STORE, useFactory: () => new PostgresAuthEventStore(pool) },
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
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: TOKEN_ISSUER,
      useFactory: () => new JwtTokenIssuer(loadConfig().jwtSecret),
    },
    ...storeProviders(),
  ],
  exports: [
    CLOCK,
    ACCOUNT_STORE,
    TRANSACTION_STORE,
    BUDGET_STORE,
    RULE_STORE,
    AGGREGATOR,
    USER_STORE,
    SESSION_STORE,
    AUTH_EVENT_STORE,
    PASSWORD_HASHER,
    TOKEN_ISSUER,
  ],
})
export class CoreModule {}
