import { createHash, generateKeyPairSync, randomBytes, type JsonWebKey } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

import { FixedClock } from '../src/infra/clock';
import {
  InMemoryAccountStore,
  InMemoryNotificationStore,
  InMemoryRuleStore,
  InMemoryTransactionStore,
} from '../src/infra/in-memory-store';
import { InMemoryBankLinkStore, InMemoryBankWebhookStore } from '../src/infra/banking/bank-link-stores';
import { AesGcmBankTokenCipher } from '../src/infra/banking/token-cipher';
import { verifyPlaidWebhookJwt } from '../src/infra/banking/plaid-provider';
import { BankingService } from '../src/modules/banking/banking.service';
import type { BankProvider, BankSyncPage } from '../src/ports/banking';
import { billingHarness } from './billing-fixtures';

class FakeProvider implements BankProvider {
  readonly name = 'plaid' as const;
  configured = true;
  pages: Array<BankSyncPage | Error> = [];
  cursors: Array<string | null> = [];
  async createLinkToken() {
    return { token: 'link-sandbox-token', expiresAt: '2026-08-08T16:00:00.000Z' };
  }
  async exchangePublicToken() {
    return { accessToken: 'access-sandbox-secret', itemId: 'item-sandbox-1' };
  }
  async sync(_accessToken: string, cursor: string | null) {
    this.cursors.push(cursor);
    const next = this.pages.shift()!;
    if (next instanceof Error) throw next;
    return next;
  }
  async verifyWebhook() {
    return true;
  }
  async removeItem() {}
}

class FailingProvider extends FakeProvider {
  override async createLinkToken(): Promise<{ token: string; expiresAt: string }> {
    throw Object.assign(new Error('provider request failed'), {
      response: {
        data: {
          error_code: 'INVALID_FIELD',
          error_message: 'private provider detail',
        },
      },
    });
  }

  override async exchangePublicToken(): Promise<{ accessToken: string; itemId: string }> {
    throw Object.assign(new Error('provider request failed'), {
      response: { data: { error_code: 'INVALID_PUBLIC_TOKEN' } },
    });
  }
}

const account = {
  id: 'plaid-account-1',
  name: 'Sandbox Checking',
  type: 'checking' as const,
  mask: '0000',
  currency: 'USD',
  balanceCurrent: 100_000,
};
const transaction = {
  providerTxnId: 'plaid-txn-1',
  accountId: account.id,
  postedAt: '2026-08-08',
  amount: -1_250,
  currency: 'USD',
  descriptor: 'BLUE BOTTLE COFFEE',
  pending: true,
};

describe('banking integration', () => {
  it('maps provider failures without exposing SDK request details', async () => {
    const provider = new FailingProvider();
    const service = new BankingService(
      new InMemoryBankLinkStore(),
      provider,
      new AesGcmBankTokenCipher(randomBytes(32)),
      new InMemoryBankWebhookStore(),
      new InMemoryAccountStore(),
      new InMemoryTransactionStore(),
      new InMemoryRuleStore(),
      new InMemoryNotificationStore(),
      new FixedClock('2026-08-08'),
      billingHarness().billing,
    );

    await expect(service.createLinkToken('user-1')).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: {
        code: 'PLAID_CONFIGURATION',
        message: 'Bank connection setup is incomplete on this server.',
      },
    });
    await expect(
      service.exchange('user-1', 'public-token', 'Sandbox Bank', null),
    ).rejects.toMatchObject({
      response: {
        message: 'That bank connection session is invalid or expired. Start again.',
      },
    });
  });

  it('encrypts Plaid tokens and reconciles added, modified, and removed rows', async () => {
    const provider = new FakeProvider();
    provider.pages.push({
      accounts: [account], added: [transaction], modified: [], removedProviderTxnIds: [],
      nextCursor: 'cursor-1', hasMore: false,
    });
    const links = new InMemoryBankLinkStore();
    const accounts = new InMemoryAccountStore();
    const transactions = new InMemoryTransactionStore();
    const service = new BankingService(
      links, provider, new AesGcmBankTokenCipher(randomBytes(32)), new InMemoryBankWebhookStore(), accounts,
      transactions, new InMemoryRuleStore(), new InMemoryNotificationStore(), new FixedClock('2026-08-08'),
      billingHarness().billing,
    );

    const link = await service.exchange('user-1', 'public-sandbox', 'First Platypus Bank', 'ins_109508');
    expect(link.encryptedAccessToken).not.toContain('access-sandbox-secret');
    expect((await transactions.list('user-1'))[0]?.amount).toBe(-1_250);

    const mutation = Object.assign(new Error('mutation'), {
      response: { data: { error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' } },
    });
    provider.pages.push(
      {
        accounts: [account], added: [], modified: [{ ...transaction, amount: -1_300 }],
        removedProviderTxnIds: [], nextCursor: 'cursor-mid-pagination', hasMore: true,
      },
      mutation,
      {
        accounts: [account], added: [], modified: [{ ...transaction, amount: -1_400 }],
        removedProviderTxnIds: [], nextCursor: 'cursor-recovered', hasMore: false,
      },
    );
    await service.sync('user-1', link.id);
    expect(provider.cursors.slice(-3)).toEqual(['cursor-1', 'cursor-mid-pagination', 'cursor-1']);
    expect((await links.get('user-1', link.id))?.cursor).toBe('cursor-recovered');

    provider.pages.push({
      accounts: [account], added: [], modified: [{ ...transaction, amount: -1_500, pending: false }],
      removedProviderTxnIds: [], nextCursor: 'cursor-2', hasMore: false,
    });
    await service.sync('user-1', link.id);
    expect((await transactions.list('user-1'))[0]).toMatchObject({ amount: -1_500, pending: false });

    provider.pages.push({
      accounts: [account], added: [], modified: [], removedProviderTxnIds: ['plaid-txn-1'],
      nextCursor: 'cursor-3', hasMore: false,
    });
    await service.sync('user-1', link.id);
    expect(await transactions.list('user-1')).toHaveLength(0);

    provider.pages.push({
      accounts: [account], added: [], modified: [], removedProviderTxnIds: [],
      nextCursor: 'cursor-4', hasMore: false,
    });
    const webhook = Buffer.from(JSON.stringify({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'item-sandbox-1',
    }));
    await expect(service.acceptWebhook(webhook, 'signed')).resolves.toEqual({ accepted: true, queued: true });
    await expect(service.acceptWebhook(webhook, 'signed')).resolves.toEqual({ accepted: true, queued: false });
    await service.drainWebhookQueue();

    await service.disconnect('user-1', link.id);
    expect(await links.get('user-1', link.id)).toBeNull();
  });

  it('detects ciphertext tampering', () => {
    const cipher = new AesGcmBankTokenCipher(randomBytes(32));
    const encrypted = cipher.encrypt('access-token');
    expect(cipher.decrypt(encrypted)).toBe('access-token');
    expect(() => cipher.decrypt(`${encrypted}x`)).toThrow();
    expect(() => AesGcmBankTokenCipher.fromBase64(`${randomBytes(32).toString('base64')}!`)).toThrow();
  });

  it('retains a broken Item and creates one reconnect alert', async () => {
    const provider = new FakeProvider();
    provider.pages.push(Object.assign(new Error('login required'), {
      response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } },
    }));
    const notifications = new InMemoryNotificationStore();
    const links = new InMemoryBankLinkStore();
    const service = new BankingService(
      links,
      provider,
      new AesGcmBankTokenCipher(randomBytes(32)),
      new InMemoryBankWebhookStore(),
      new InMemoryAccountStore(),
      new InMemoryTransactionStore(),
      new InMemoryRuleStore(),
      notifications,
      new FixedClock('2026-08-08'),
      billingHarness().billing,
    );

    const link = await service.exchange('user-1', 'public-sandbox', 'First Platypus Bank', null);
    expect(link.status).toBe('needs_reauth');
    expect(await notifications.list('user-1')).toMatchObject([
      { kind: 'bank_sync', severity: 'critical', title: 'Reconnect your bank' },
    ]);
  });

  it('verifies Plaid ES256 signatures against the exact raw body and freshness window', async () => {
    const now = 1_786_208_400;
    const body = Buffer.from('{"item_id":"item-1"}');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = {
      ...(publicKey.export({ format: 'jwk' }) as JsonWebKey),
      alg: 'ES256',
      use: 'sig',
      kid: 'plaid-key-1',
    };
    const signature = jwt.sign(
      { iat: now, request_body_sha256: createHash('sha256').update(body).digest('hex') },
      privateKey,
      { algorithm: 'ES256', keyid: 'plaid-key-1' },
    );
    const getKey = async () => jwk;

    await expect(verifyPlaidWebhookJwt(body, signature, getKey, now)).resolves.toBe(true);
    await expect(verifyPlaidWebhookJwt(Buffer.from('{}'), signature, getKey, now)).resolves.toBe(false);
    await expect(verifyPlaidWebhookJwt(body, signature, getKey, now + 301)).resolves.toBe(false);
  });
});
