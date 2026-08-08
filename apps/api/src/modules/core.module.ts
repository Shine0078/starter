import { Global, Logger, Module, type Provider } from '@nestjs/common';

import { loadConfig } from '../config';
import { SystemClock } from '../infra/clock';
import {
  InMemoryAccountStore,
  InMemoryBudgetStore,
  InMemoryGoalStore,
  InMemoryNotificationStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../infra/in-memory-store';
import { MockAggregator } from '../infra/mock-aggregator';
import { getAppPool } from '../infra/postgres/pool';
import {
  PostgresAccountStore,
  PostgresBudgetStore,
  PostgresGoalStore,
  PostgresNotificationStore,
  PostgresRuleStore,
  PostgresTransactionStore,
} from '../infra/postgres/stores';
import { Argon2PasswordHasher } from '../infra/auth/argon2-hasher';
import {
  InMemoryAccountDeletionStore,
  PostgresAccountDeletionStore,
} from '../infra/auth/account-deletion-stores';
import {
  DevelopmentEmailSender,
  InMemoryAuthActionTokenStore,
  PostgresAuthActionTokenStore,
  SmtpEmailSender,
} from '../infra/auth/auth-action-stores';
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
  GOAL_STORE,
  NOTIFICATION_STORE,
  RULE_STORE,
  TRANSACTION_STORE,
} from '../ports';
import {
  ACCOUNT_DELETION_STORE,
  AUTH_ACTION_TOKEN_STORE,
  AUTH_EVENT_STORE,
  EMAIL_SENDER,
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
    const accounts = new InMemoryAccountStore();
    const transactions = new InMemoryTransactionStore();
    const budgets = new InMemoryBudgetStore();
    const rules = new InMemoryRuleStore();
    const goals = new InMemoryGoalStore();
    const notifications = new InMemoryNotificationStore();
    const users = new InMemoryUserStore();
    const sessions = new InMemorySessionStore();
    const events = new InMemoryAuthEventStore();
    const actionTokens = new InMemoryAuthActionTokenStore();
    const deletions = new InMemoryAccountDeletionStore(
      users,
      sessions,
      events,
      accounts,
      transactions,
      budgets,
      rules,
      goals,
      notifications,
    );
    return [
      { provide: ACCOUNT_STORE, useValue: accounts },
      { provide: TRANSACTION_STORE, useValue: transactions },
      { provide: BUDGET_STORE, useValue: budgets },
      { provide: RULE_STORE, useValue: rules },
      { provide: GOAL_STORE, useValue: goals },
      { provide: NOTIFICATION_STORE, useValue: notifications },
      { provide: USER_STORE, useValue: users },
      { provide: SESSION_STORE, useValue: sessions },
      { provide: AUTH_EVENT_STORE, useValue: events },
      { provide: ACCOUNT_DELETION_STORE, useValue: deletions },
      { provide: AUTH_ACTION_TOKEN_STORE, useValue: actionTokens },
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
    { provide: GOAL_STORE, useFactory: () => new PostgresGoalStore(pool) },
    { provide: NOTIFICATION_STORE, useFactory: () => new PostgresNotificationStore(pool) },
    { provide: USER_STORE, useFactory: () => new PostgresUserStore(pool) },
    { provide: SESSION_STORE, useFactory: () => new PostgresSessionStore(pool) },
    { provide: AUTH_EVENT_STORE, useFactory: () => new PostgresAuthEventStore(pool) },
    { provide: ACCOUNT_DELETION_STORE, useFactory: () => new PostgresAccountDeletionStore(pool) },
    { provide: AUTH_ACTION_TOKEN_STORE, useFactory: () => new PostgresAuthActionTokenStore(pool) },
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
      provide: EMAIL_SENDER,
      useFactory: () => {
        const smtp = {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD,
          from: process.env.EMAIL_FROM,
        };
        const smtpWasConfigured =
          [smtp.host, smtp.user, smtp.password, smtp.from].some(Boolean) ||
          process.env.SMTP_PORT !== undefined;
        const validPort = Number.isInteger(smtp.port) && smtp.port > 0 && smtp.port <= 65_535;
        const smtpIsComplete =
          smtp.host && smtp.user && smtp.password && smtp.from && validPort;
        if (smtpIsComplete) {
          return new SmtpEmailSender({
            host: smtp.host!,
            port: smtp.port,
            secure: smtp.secure,
            user: smtp.user!,
            password: smtp.password!,
            from: smtp.from!,
          });
        }
        if (smtpWasConfigured || loadConfig().isProduction) {
          throw new Error(
            'SMTP_HOST, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, and a valid SMTP_PORT are required for SMTP email.',
          );
        }
        return new DevelopmentEmailSender();
      },
    },
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
    GOAL_STORE,
    NOTIFICATION_STORE,
    AGGREGATOR,
    USER_STORE,
    SESSION_STORE,
    AUTH_EVENT_STORE,
    ACCOUNT_DELETION_STORE,
    AUTH_ACTION_TOKEN_STORE,
    EMAIL_SENDER,
    PASSWORD_HASHER,
    TOKEN_ISSUER,
  ],
})
export class CoreModule {}
