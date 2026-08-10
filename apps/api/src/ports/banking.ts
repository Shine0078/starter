import type { Account, RawTransaction } from '../domain/types';

export const BANK_LINK_STORE = 'BANK_LINK_STORE';
export const BANK_PROVIDER = 'BANK_PROVIDER';
export const BANK_TOKEN_CIPHER = 'BANK_TOKEN_CIPHER';
export const BANK_WEBHOOK_STORE = 'BANK_WEBHOOK_STORE';

export type BankLinkStatus = 'healthy' | 'syncing' | 'needs_reauth' | 'error' | 'revoked';

/**
 * Which Plaid Link surface a link token is minted for.
 *
 * Not cosmetic: a token created with `android_package_name` is bound to the
 * Android app and Plaid refuses it in a browser, and vice versa. The client
 * says which one it is, and the provider configures the token to match.
 */
export const LINK_PLATFORMS = ['android', 'ios', 'web'] as const;
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export function isLinkPlatform(value: unknown): value is LinkPlatform {
  return value === 'android' || value === 'ios' || value === 'web';
}

export interface BankLink {
  id: string;
  provider: 'plaid';
  providerItemId: string;
  institutionId: string | null;
  institutionName: string;
  encryptedAccessToken: string;
  cursor: string | null;
  status: BankLinkStatus;
  errorCode: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface BankLinkStore {
  list(userId: string): Promise<BankLink[]>;
  get(userId: string, id: string): Promise<BankLink | null>;
  getByProviderItemId(providerItemId: string): Promise<{ userId: string; link: BankLink } | null>;
  create(userId: string, link: BankLink): Promise<BankLink>;
  update(userId: string, id: string, patch: Partial<BankLink>): Promise<BankLink | null>;
  startSync(userId: string, id: string): Promise<BankLink | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

export interface BankSyncPage {
  accounts: Account[];
  added: RawTransaction[];
  modified: RawTransaction[];
  removedProviderTxnIds: string[];
  nextCursor: string;
  hasMore: boolean;
}

export interface BankProvider {
  readonly name: 'plaid';
  configured: boolean;
  createLinkToken(
    userId: string,
    accessToken?: string,
    platform?: LinkPlatform,
  ): Promise<{ token: string; expiresAt: string }>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  sync(accessToken: string, cursor: string | null): Promise<BankSyncPage>;
  verifyWebhook(rawBody: Buffer, signature: string): Promise<boolean>;
  removeItem(accessToken: string): Promise<void>;
}

export interface BankTokenCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface BankWebhookJob {
  id: string;
  userId: string;
  linkId: string;
  bodyHash: string;
  attempts: number;
  availableAt: string;
}

export interface BankWebhookStore {
  enqueue(job: BankWebhookJob): Promise<boolean>;
  claim(limit: number): Promise<BankWebhookJob[]>;
  complete(userId: string, id: string): Promise<void>;
  retry(userId: string, id: string, availableAt: string, terminal: boolean): Promise<void>;
  purgeLink(userId: string, linkId: string): Promise<void>;
}
