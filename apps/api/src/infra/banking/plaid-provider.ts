import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type Transaction as PlaidTransaction,
} from 'plaid';
import { createHash, createPublicKey, timingSafeEqual, type JsonWebKey } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import type { Account, AccountType, RawTransaction } from '../../domain/types';
import type { BankProvider, BankSyncPage, LinkPlatform } from '../../ports/banking';

export interface PlaidProviderOptions {
  clientId?: string;
  secret?: string;
  environment: 'sandbox' | 'development' | 'production';
  webhookUrl?: string;
  countries: string[];
  androidPackageName: string;
  /** Registered OAuth return URL for Plaid Link on the web. Optional: the
   *  Sandbox test institutions do not need one. */
  webRedirectUri?: string;
}

export class PlaidBankProvider implements BankProvider {
  readonly name = 'plaid' as const;
  readonly configured: boolean;
  private readonly client: PlaidApi | null;
  private readonly verificationKeys = new Map<string, JsonWebKey>();

  constructor(private readonly options: PlaidProviderOptions) {
    this.configured = Boolean(options.clientId && options.secret);
    if (Boolean(options.clientId) !== Boolean(options.secret)) {
      throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be configured together.');
    }
    if (!Object.prototype.hasOwnProperty.call(PlaidEnvironments, options.environment)) {
      throw new Error('PLAID_ENVIRONMENT must be sandbox, development, or production.');
    }
    if (options.countries.length === 0) throw new Error('PLAID_COUNTRIES must not be empty.');
    if (this.configured && options.environment === 'production' && !options.webhookUrl?.startsWith('https://')) {
      throw new Error('PLAID_WEBHOOK_URL must be an HTTPS URL in Plaid production.');
    }
    if (!this.configured) {
      this.client = null;
      return;
    }
    const configuration = new Configuration({
      basePath: PlaidEnvironments[options.environment],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': options.clientId,
          'PLAID-SECRET': options.secret,
        },
      },
    });
    this.client = new PlaidApi(configuration);
  }

  async createLinkToken(
    userId: string,
    accessToken?: string,
    platform: LinkPlatform = 'android',
  ): Promise<{ token: string; expiresAt: string }> {
    const client = this.requireClient();

    // `android_package_name` binds the token to the Android app; Plaid rejects
    // such a token in a browser. The web surface takes a redirect_uri instead,
    // and only when one is configured — it must be registered in the Plaid
    // dashboard first, and an unregistered value is refused outright.
    const surface =
      platform === 'web' || platform === 'ios'
        ? this.options.webRedirectUri
          ? { redirect_uri: this.options.webRedirectUri }
          : {}
        : { android_package_name: this.options.androidPackageName };

    const response = await client.linkTokenCreate({
      client_name: 'FINVERSE',
      language: 'en',
      country_codes: this.options.countries.map(toCountryCode),
      user: { client_user_id: userId },
      ...(accessToken ? { access_token: accessToken } : { products: [Products.Transactions] }),
      ...(this.options.webhookUrl ? { webhook: this.options.webhookUrl } : {}),
      ...surface,
      transactions: { days_requested: 180 },
    });
    return { token: response.data.link_token, expiresAt: response.data.expiration };
  }

  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const response = await this.requireClient().itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: response.data.access_token, itemId: response.data.item_id };
  }

  async sync(accessToken: string, cursor: string | null): Promise<BankSyncPage> {
    const response = await this.requireClient().transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: 500,
      options: { include_original_description: true },
    });
    return {
      accounts: response.data.accounts.map(toAccount),
      added: response.data.added.map(toRawTransaction),
      modified: response.data.modified.map(toRawTransaction),
      removedProviderTxnIds: response.data.removed.map((row) => row.transaction_id),
      nextCursor: response.data.next_cursor,
      hasMore: response.data.has_more,
    };
  }

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<boolean> {
    if (!this.client || !signature) return false;
    return verifyPlaidWebhookJwt(rawBody, signature, async (keyId) => {
      const cached = this.verificationKeys.get(keyId);
      if (cached) return cached;
      const response = await this.client!.webhookVerificationKeyGet({ key_id: keyId });
      const key = response.data.key as unknown as JsonWebKey;
      this.verificationKeys.set(keyId, key);
      return key;
    });
  }

  async removeItem(accessToken: string): Promise<void> {
    await this.requireClient().itemRemove({ access_token: accessToken });
  }

  private requireClient(): PlaidApi {
    if (!this.client) {
      throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
    }
    return this.client;
  }
}

/** Verify Plaid's ES256 JWT and bind it to the exact raw request bytes. */
export async function verifyPlaidWebhookJwt(
  rawBody: Buffer,
  signature: string,
  getKey: (keyId: string) => Promise<JsonWebKey>,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    if (signature.length > 4_096) return false;
    const decoded = jwt.decode(signature, { complete: true });
    if (!decoded || decoded.header.alg !== 'ES256' || typeof decoded.header.kid !== 'string') return false;
    const keyId = decoded.header.kid;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(keyId)) return false;
    const jwk = await getKey(keyId);
    const plaidKey = jwk as JsonWebKey & { created_at?: number; expired_at?: number | null };
    if (
      jwk.kty !== 'EC' ||
      jwk.crv !== 'P-256' ||
      jwk.alg !== 'ES256' ||
      jwk.use !== 'sig' ||
      jwk.kid !== keyId ||
      (typeof plaidKey.created_at === 'number' && plaidKey.created_at > nowSeconds + 30) ||
      (typeof plaidKey.expired_at === 'number' && plaidKey.expired_at <= nowSeconds)
    ) return false;

    const payload = jwt.verify(signature, createPublicKey({ key: jwk, format: 'jwk' }), {
      algorithms: ['ES256'],
    }) as JwtPayload;
    if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 30 || nowSeconds - payload.iat > 300) {
      return false;
    }
    if (typeof payload.request_body_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.request_body_sha256)) {
      return false;
    }
    const expected = Buffer.from(payload.request_body_sha256, 'hex');
    const actual = createHash('sha256').update(rawBody).digest();
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function toCountryCode(value: string): CountryCode {
  const code = value.trim().toUpperCase();
  const found = Object.values(CountryCode).find((candidate) => candidate === code);
  if (!found) throw new Error(`Unsupported PLAID_COUNTRIES entry "${value}".`);
  return found;
}

function toAccountType(account: AccountBase): AccountType {
  switch (String(account.type)) {
    case 'credit':
      return 'credit_card';
    case 'investment':
    case 'brokerage':
      return 'investment';
    case 'loan':
      return 'loan';
    case 'depository':
      return String(account.subtype) === 'savings' ? 'savings' : 'checking';
    default:
      return 'cash';
  }
}

function minorUnits(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function toAccount(account: AccountBase): Account {
  const type = toAccountType(account);
  const current = minorUnits(account.balances.current ?? account.balances.available);
  return {
    id: account.account_id,
    name: account.name,
    type,
    mask: account.mask?.slice(-4) ?? '----',
    currency: account.balances.iso_currency_code ?? 'USD',
    balanceCurrent: type === 'credit_card' || type === 'loan' ? -Math.abs(current) : current,
    ...(account.balances.limit === null || account.balances.limit === undefined
      ? {}
      : { creditLimit: minorUnits(account.balances.limit) }),
  };
}

function toRawTransaction(transaction: PlaidTransaction): RawTransaction {
  return {
    providerTxnId: transaction.transaction_id,
    accountId: transaction.account_id,
    postedAt: transaction.date,
    // Plaid: positive is an outflow. FINVERSE: negative is an outflow.
    amount: -minorUnits(transaction.amount),
    currency: transaction.iso_currency_code ?? 'USD',
    descriptor: transaction.original_description ?? transaction.merchant_name ?? transaction.name,
    pending: transaction.pending,
  };
}
