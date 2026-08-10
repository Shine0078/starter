import { Inject, Injectable } from '@nestjs/common';

import {
  BANK_LINK_STORE,
  BANK_PROVIDER,
  BANK_TOKEN_CIPHER,
  BANK_WEBHOOK_STORE,
  type BankAccountRevoker,
  type BankLinkStore,
  type BankProvider,
  type BankTokenCipher,
  type BankWebhookStore,
} from '../../ports/banking';

/**
 * Revokes external bank Items before an account enters its deletion window.
 *
 * The account-deletion store owns our rows, while this adapter owns the
 * provider side effect. Keeping the boundary explicit prevents a future
 * provider adapter from accidentally treating a database delete as consent
 * revocation. The operation is idempotent: an already-removed Item is treated
 * as successfully revoked, and a later retry only visits links that remain
 * active.
 */
@Injectable()
export class AccountBankRevoker implements BankAccountRevoker {
  constructor(
    @Inject(BANK_LINK_STORE) private readonly links: BankLinkStore,
    @Inject(BANK_PROVIDER) private readonly provider: BankProvider,
    @Inject(BANK_TOKEN_CIPHER) private readonly cipher: BankTokenCipher,
    @Inject(BANK_WEBHOOK_STORE) private readonly webhooks: BankWebhookStore,
  ) {}

  async revokeAll(userId: string): Promise<{ revoked: number }> {
    const active = (await this.links.list(userId)).filter(
      (link) => link.status !== 'revoked',
    );
    if (active.length === 0) return { revoked: 0 };
    if (!this.provider.configured) {
      throw new BankRevocationError(
        'Bank provider is unavailable; account deletion was not started.',
      );
    }

    let revoked = 0;
    for (const link of active) {
      let accessToken: string;
      try {
        accessToken = this.cipher.decrypt(link.encryptedAccessToken);
      } catch {
        throw new BankRevocationError(
          'A stored bank connection could not be opened for revocation.',
        );
      }

      try {
        await this.provider.removeItem(accessToken);
      } catch (error) {
        // Plaid returns ITEM_NOT_FOUND when the user already removed the Item
        // in the provider dashboard. Treat that state as the desired result;
        // all other provider errors must leave deletion recoverable and retryable.
        if (providerErrorCode(error) !== 'ITEM_NOT_FOUND') {
          throw new BankRevocationError(
            'A bank connection could not be revoked. Try account deletion again when the provider is available.',
          );
        }
      }

      await this.webhooks.purgeLink(userId, link.id);
      await this.links.update(userId, link.id, {
        status: 'revoked',
        errorCode: null,
        cursor: null,
      });
      revoked += 1;
    }
    return { revoked };
  }
}

/** Safe, user-facing failure without carrying provider SDK request details. */
export class BankRevocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankRevocationError';
  }
}

function providerErrorCode(error: unknown): string | null {
  const response = (error as {
    response?: { data?: { error_code?: unknown } };
  }).response;
  const code = response?.data?.error_code;
  return typeof code === 'string' ? code : null;
}
