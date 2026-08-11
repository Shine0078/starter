import { randomBytes } from 'node:crypto';
import { Global, Logger, Module, type Provider } from '@nestjs/common';

import { loadConfig } from '../config';
import { SystemClock } from '../infra/clock';
import { FinanceEventBus } from '../infra/events/finance-event-bus';
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
  DisabledPasswordBreachChecker,
  HaveIBeenPwnedPasswordBreachChecker,
} from '../infra/auth/password-breach-checker';
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
import { AesGcmMfaSecretCipher, UnavailableMfaSecretCipher } from '../infra/auth/mfa-cipher';
import { InMemoryMfaStore, PostgresMfaStore } from '../infra/auth/mfa-stores';
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
import { AccountBankRevoker } from '../infra/banking/account-revoker';
import { AesGcmBankTokenCipher } from '../infra/banking/token-cipher';
import { RuleBasedReceiptOcr } from '../infra/receipts/receipt-ocr-providers';
import {
  InMemoryReceiptStore,
  PostgresReceiptStore,
} from '../infra/receipts/receipt-stores';
import {
  FcmHttpV1PushProvider,
  UnconfiguredPushProvider,
} from '../infra/push/push-providers';
import {
  InMemoryPushTokenStore,
  PostgresPushTokenStore,
} from '../infra/push/push-token-stores';
import { Fido2Verifier } from '../infra/webauthn/fido2-verifier';
import {
  InMemoryWebAuthnCredentialStore,
  PostgresWebAuthnCredentialStore,
} from '../infra/webauthn/webauthn-credential-stores';
import { StripeBillingProvider } from '../infra/billing/stripe-provider';
import {
  InMemoryBillingEventStore,
  InMemorySubscriptionStore,
  PostgresBillingEventStore,
  PostgresSubscriptionStore,
} from '../infra/billing/subscription-stores';
import { InMemoryConsentStore, PostgresConsentStore } from '../infra/privacy/consent-stores';
import {
  BANK_LINK_STORE,
  BANK_ACCOUNT_REVOKER,
  BANK_PROVIDER,
  BANK_TOKEN_CIPHER,
  BANK_WEBHOOK_STORE,
} from '../ports/banking';
import { BILLING_EVENT_STORE, BILLING_PROVIDER, SUBSCRIPTION_STORE } from '../ports/billing';
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
  MFA_SECRET_CIPHER,
  MFA_STORE,
  PASSWORD_BREACH_CHECKER,
  SESSION_STORE,
  TOKEN_ISSUER,
  USER_STORE,
} from '../ports/auth';
import { CONSENT_STORE } from '../ports/privacy';
import { RECEIPT_OCR_PROVIDER, RECEIPT_STORE } from '../ports/receipts';
import { PUSH_PROVIDER, PUSH_TOKEN_STORE } from '../ports/push';
import {
  WEBAUTHN_CREDENTIAL_STORE,
  WEBAUTHN_VERIFIER,
} from '../ports/webauthn';

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
    const mfa = new InMemoryMfaStore();
    const subscriptions = new InMemorySubscriptionStore();
    const receipts = new InMemoryReceiptStore();
    const pushTokens = new InMemoryPushTokenStore();
    const webauthnCredentials = new InMemoryWebAuthnCredentialStore();
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
      mfa,
      subscriptions,
      receipts,
      pushTokens,
      webauthnCredentials,
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
      { provide: MFA_STORE, useValue: mfa },
      { provide: SUBSCRIPTION_STORE, useValue: subscriptions },
      { provide: BILLING_EVENT_STORE, useValue: new InMemoryBillingEventStore() },
      { provide: RECEIPT_STORE, useValue: receipts },
      { provide: PUSH_TOKEN_STORE, useValue: pushTokens },
      { provide: WEBAUTHN_CREDENTIAL_STORE, useValue: webauthnCredentials },
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
    { provide: MFA_STORE, useFactory: () => new PostgresMfaStore(pool) },
    { provide: SUBSCRIPTION_STORE, useFactory: () => new PostgresSubscriptionStore(pool) },
    { provide: BILLING_EVENT_STORE, useFactory: () => new PostgresBillingEventStore(pool) },
    { provide: RECEIPT_STORE, useFactory: () => new PostgresReceiptStore(pool) },
    { provide: PUSH_TOKEN_STORE, useFactory: () => new PostgresPushTokenStore(pool) },
    {
      provide: WEBAUTHN_CREDENTIAL_STORE,
      useFactory: () => new PostgresWebAuthnCredentialStore(pool),
    },
  ];
}

@Global()
@Module({
  providers: [
    FinanceEventBus,
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: AGGREGATOR,
      useFactory: () => new MockAggregator({ today: new SystemClock().today() }),
    },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: PASSWORD_BREACH_CHECKER,
      useFactory: () => {
        const mode = loadConfig().passwordBreachCheck.mode;
        return mode === 'disabled'
          ? new DisabledPasswordBreachChecker()
          : new HaveIBeenPwnedPasswordBreachChecker({ required: mode === 'required' });
      },
    },
    {
      provide: MFA_SECRET_CIPHER,
      useFactory: () => process.env.MFA_ENCRYPTION_KEY
        ? AesGcmMfaSecretCipher.fromBase64(process.env.MFA_ENCRYPTION_KEY)
        : new UnavailableMfaSecretCipher(),
    },
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
          webRedirectUri: process.env.PLAID_WEB_REDIRECT_URI,
          iosRedirectUri: process.env.PLAID_IOS_REDIRECT_URI,
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
    { provide: BANK_ACCOUNT_REVOKER, useClass: AccountBankRevoker },
    {
      provide: BILLING_PROVIDER,
      useFactory: () =>
        new StripeBillingProvider({
          secretKey: process.env.STRIPE_SECRET_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          priceIds: {
            pro: {
              month: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
              year: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
            },
          },
          trialDays: Number(process.env.BILLING_TRIAL_DAYS ?? 14),
        }),
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
    { provide: RECEIPT_OCR_PROVIDER, useClass: RuleBasedReceiptOcr },
    {
      provide: PUSH_PROVIDER,
      useFactory: () => {
        const credentials = loadConfig().push.fcmCredentialsJson;
        return credentials
          ? FcmHttpV1PushProvider.fromServiceAccountJson(credentials)
          : new UnconfiguredPushProvider();
      },
    },
    {
      provide: WEBAUTHN_VERIFIER,
      useFactory: () => new Fido2Verifier(loadConfig().webauthn ?? null),
    },
    ...storeProviders(),
  ],
  exports: [
    FinanceEventBus,
    CLOCK,
    ACCOUNT_STORE,
    TRANSACTION_STORE,
    BUDGET_STORE,
    RULE_STORE,
    GOAL_STORE,
    NOTIFICATION_STORE,
    BANK_LINK_STORE,
    BANK_PROVIDER,
    BANK_ACCOUNT_REVOKER,
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
    PASSWORD_BREACH_CHECKER,
    TOKEN_ISSUER,
    CONSENT_STORE,
    REGISTRATION_STORE,
    MFA_STORE,
    MFA_SECRET_CIPHER,
    BILLING_PROVIDER,
    SUBSCRIPTION_STORE,
    BILLING_EVENT_STORE,
    RECEIPT_STORE,
    RECEIPT_OCR_PROVIDER,
    PUSH_TOKEN_STORE,
    PUSH_PROVIDER,
    WEBAUTHN_CREDENTIAL_STORE,
    WEBAUTHN_VERIFIER,
  ],
})
export class CoreModule {}
