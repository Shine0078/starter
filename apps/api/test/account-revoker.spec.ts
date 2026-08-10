import { describe, expect, it, vi } from 'vitest';

import { AccountBankRevoker, BankRevocationError } from '../src/infra/banking/account-revoker';
import { InMemoryBankLinkStore, InMemoryBankWebhookStore } from '../src/infra/banking/bank-link-stores';
import type { BankLink, BankProvider, BankTokenCipher } from '../src/ports/banking';

const link = (id: string, status: BankLink['status'] = 'healthy'): BankLink => ({
  id,
  provider: 'plaid',
  providerItemId: `item-${id}`,
  institutionId: 'ins_test',
  institutionName: `Bank ${id}`,
  encryptedAccessToken: `encrypted-${id}`,
  cursor: 'cursor',
  status,
  errorCode: null,
  lastSyncedAt: null,
  createdAt: '2026-08-10T00:00:00.000Z',
});

function provider(overrides: Partial<BankProvider> = {}): BankProvider {
  return {
    name: 'plaid',
    configured: true,
    createLinkToken: vi.fn(),
    exchangePublicToken: vi.fn(),
    sync: vi.fn(),
    verifyWebhook: vi.fn(),
    removeItem: vi.fn(),
    ...overrides,
  } as BankProvider;
}

const cipher: BankTokenCipher = {
  encrypt: (value) => `encrypted:${value}`,
  decrypt: (value) => value.replace(/^encrypted-/, 'clear-'),
};

describe('AccountBankRevoker', () => {
  it('revokes every active provider Item and purges its webhook jobs', async () => {
    const links = new InMemoryBankLinkStore();
    const webhooks = new InMemoryBankWebhookStore();
    await links.create('user-1', link('one'));
    await links.create('user-1', link('two'));
    await links.create('user-1', link('already-revoked', 'revoked'));
    await webhooks.enqueue({
      id: 'job-1',
      userId: 'user-1',
      linkId: 'one',
      bodyHash: 'hash-1',
      attempts: 0,
      availableAt: '2026-08-10T00:00:00.000Z',
    });

    const removeItem = vi.fn().mockResolvedValue(undefined);
    const revoker = new AccountBankRevoker(
      links,
      provider({ removeItem }),
      cipher,
      webhooks,
    );

    await expect(revoker.revokeAll('user-1')).resolves.toEqual({ revoked: 2 });
    expect(removeItem).toHaveBeenCalledTimes(2);
    expect(removeItem).toHaveBeenCalledWith('clear-one');
    expect((await links.get('user-1', 'one'))?.status).toBe('revoked');
    expect((await links.get('user-1', 'one'))?.cursor).toBeNull();
    expect(await webhooks.claim(10)).toHaveLength(0);
  });

  it('treats an already-removed provider Item as successfully revoked', async () => {
    const links = new InMemoryBankLinkStore();
    const webhooks = new InMemoryBankWebhookStore();
    await links.create('user-1', link('one'));
    const revoker = new AccountBankRevoker(
      links,
      provider({
        removeItem: vi.fn().mockRejectedValue({
          response: { data: { error_code: 'ITEM_NOT_FOUND' } },
        }),
      }),
      cipher,
      webhooks,
    );

    await expect(revoker.revokeAll('user-1')).resolves.toEqual({ revoked: 1 });
    expect((await links.get('user-1', 'one'))?.status).toBe('revoked');
  });

  it('fails closed without leaking provider request details', async () => {
    const links = new InMemoryBankLinkStore();
    const webhooks = new InMemoryBankWebhookStore();
    await links.create('user-1', link('one'));
    const revoker = new AccountBankRevoker(
      links,
      provider({
        removeItem: vi.fn().mockRejectedValue({
          response: {
            data: {
              error_code: 'INTERNAL_SERVER_ERROR',
              request: { headers: { 'PLAID-SECRET': 'do-not-leak' } },
            },
          },
        }),
      }),
      cipher,
      webhooks,
    );

    const error = await revoker.revokeAll('user-1').catch((value) => value);
    expect(error).toBeInstanceOf(BankRevocationError);
    expect(String(error)).toContain('could not be revoked');
    expect(String(error)).not.toContain('do-not-leak');
    expect((await links.get('user-1', 'one'))?.status).toBe('healthy');
  });

  it('does not require provider credentials when the account has no active links', async () => {
    const revoker = new AccountBankRevoker(
      new InMemoryBankLinkStore(),
      provider({ configured: false }),
      cipher,
      new InMemoryBankWebhookStore(),
    );

    await expect(revoker.revokeAll('user-1')).resolves.toEqual({ revoked: 0 });
  });
});
