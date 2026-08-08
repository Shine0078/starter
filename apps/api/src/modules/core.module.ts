import { randomBytes } from 'node:crypto';
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
  InMemoryRegistrationStore,
  PostgresRegistrationStore,
} from '../infra/auth/registration-stores';
import {
  InMemoryBankLinkStore,
  InMemoryBankWebhookStore,
  PostgresBankLinkStore,
  PostgresBankWebhookStore,
} from '../infra/banking/bank-link-stores';
import { PlaidBankProvider } from '../infra/banking/plaid-provider';
import { AesGcmBankTokenCipher } from '../infra/banking/token-cipher';
import { InMemoryConsentStore, PostgresConsentStore } from '../infra/privacy/consent-stores';
import {
  BANK_LINK_STORE,
  BANK_PROVIDER,
  BANK_TOKEN_CIPHER,
  BANK_WEBHOOK_STORE,
} from '../ports/banking';
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
  REGISTRATION_STORE,
  SESSION_STORE,
  TOKEN_ISSUER,
  USER_STORE,
} from '../ports/auth';
import { CONSENT_STORE } from '../ports/privacy';

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
    const bankLinks = new InMemoryBankLinkStore();
    const bankWebhooks = new InMemoryBankWebhookStore();
    const users = new InMemoryUserStore();
    const sessions = new InMemorySessionStore();
    const events = new InMemoryAuthEventStore();
    const actionTokens = new InMemoryAuthActionTokenStore();
    const consents = new InMemoryConsentStore();
    const registrations = new InMemoryRegistrationStore(users, consents);
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
      bankLinks,
      bankWebhooks,
      consents,
    );
    return [
      { provide: ACCOUNT_STORE, useValue: accounts },
      { provide: TRANSACTION_STORE, useValue: transactions },
      { provide: BUDGET_STORE, useValue: budgets },
      { provide: RULE_STORE, useValue: rules },
      { provide: GOAL_STORE, useValue: goals },
      { provide: NOTIFICATION_STORE, useValue: notifications },
      { provide: BANK_LINK_STORE, useValue: bankLinks },
      { provide: BANK_WEBHOOK_STORE, useValue: bankWebhooks },
      { provide: USER_STORE, useValue: users },
      { provide: SESSION_STORE, useValue: sessions },
      { provide: AUTH_EVENT_STORE, useValue: events },
      { provide: ACCOUNT_DELETION_STORE, useValue: deletions },
      { provide: AUTH_ACTION_TOKEN_STORE, useValue: actionTokens },
      { provide: CONSENT_STORE, useValue: consents },
      { provide: REGISTRATION_STORE, useValue: registrations },
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
    { provide: BANK_LINK_STORE, useFactory: () => new PostgresBankLinkStore(pool) },
    { provide: BANK_WEBHOOK_STORE, useFactory: () => new PostgresBankWebhookStore(pool) },
    { provide: USER_STORE, useFactory: () => new PostgresUserStore(pool) },
    { provide: SESSION_STORE, useFactory: () => new PostgresSessionStore(pool) },
    { provide: AUTH_EVENT_STORE, useFactory: () => new PostgresAuthEventStore(pool) },
    { provide: ACCOUNT_DELETION_STORE, useFactory: () => new PostgresAccountDeletionStore(pool) },
    { provide: AUTH_ACTION_TOKEN_STORE, useFactory: () => new PostgresAuthActionTokenStore(pool) },
    { provide: CONSENT_STORE, useFactory: () => new PostgresConsentStore(pool) },
    { provide: REGISTRATION_STORE, useFactory: () => new PostgresRegistrationStore(pool) },
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
      provide: BANK_PROVIDER,
      useFactory: () =>
        new PlaidBankProvider({
          clientId: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_SECRET,
          environment: (process.env.PLAID_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'development' | 'production',
          webhookUrl: process.env.PLAID_WEBHOOK_URL,
          countries: (process.env.PLAID_COUNTRIES ?? 'CA,US').split(',').filter(Boolean),
          androidPackageName: 'com.finverse.finance',
        }),
    },
    {
      provide: BANK_TOKEN_CIPHER,
      useFactory: () => {
        const configured = process.env.PLAID_CLIENT_ID || process.env.PLAID_SECRET;
        const key = process.env.BANK_TOKEN_ENCRYPTION_KEY;
        if (configured && !key) {
          throw new Error('BANK_TOKEN_ENCRYPTION_KEY is required when Plaid is configured.');
        }
        return key
          ? AesGcmBankTokenCipher.fromBase64(key)
          : new AesGcmBankTokenCipher(randomBytes(32));
      },
    },
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
    BANK_LINK_STORE,
    BANK_PROVIDER,
    BANK_TOKEN_CIPHER,
    BANK_WEBHOOK_STORE,
    AGGREGATOR,
    USER_STORE,
    SESSION_STORE,
    AUTH_EVENT_STORE,
    ACCOUNT_DELETION_STORE,
    AUTH_ACTION_TOKEN_STORE,
    EMAIL_SENDER,
    PASSWORD_HASHER,
    TOKEN_ISSUER,
    CONSENT_STORE,
    REGISTRATION_STORE,
  ],
})
export class CoreModule {}
