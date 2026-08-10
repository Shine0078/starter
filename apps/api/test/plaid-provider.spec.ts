import { PlaidApi } from 'plaid';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaidBankProvider } from '../src/infra/banking/plaid-provider';

const tokenResponse = {
  data: {
    link_token: 'link-sandbox-token',
    expiration: '2099-01-01T00:00:00.000Z',
  },
};

function provider(overrides: Partial<ConstructorParameters<typeof PlaidBankProvider>[0]> = {}) {
  return new PlaidBankProvider({
    clientId: 'client-id',
    secret: 'secret',
    environment: 'sandbox',
    countries: ['CA'],
    androidPackageName: 'com.finverse.finance',
    ...overrides,
  });
}

describe('Plaid link-token surfaces', () => {
  afterEach(() => vi.restoreAllMocks());

  it('binds Android tokens to the registered application package', async () => {
    const create = vi
      .spyOn(PlaidApi.prototype, 'linkTokenCreate')
      .mockResolvedValue(tokenResponse as never);

    await provider().createLinkToken('user-1', undefined, 'android');

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      android_package_name: 'com.finverse.finance',
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('redirect_uri');
  });

  it('uses separate registered redirects for web and native iOS', async () => {
    const create = vi
      .spyOn(PlaidApi.prototype, 'linkTokenCreate')
      .mockResolvedValue(tokenResponse as never);
    const app = provider({
      webRedirectUri: 'https://app.example.com/app/',
      iosRedirectUri: 'https://app.example.com/plaid/',
    });

    await app.createLinkToken('user-1', undefined, 'web');
    await app.createLinkToken('user-1', undefined, 'ios');

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      redirect_uri: 'https://app.example.com/app/',
    });
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      redirect_uri: 'https://app.example.com/plaid/',
    });
  });

  it('fails closed when iOS OAuth has no Universal Link configured', async () => {
    const create = vi.spyOn(PlaidApi.prototype, 'linkTokenCreate');

    await expect(
      provider().createLinkToken('user-1', undefined, 'ios'),
    ).rejects.toThrow('PLAID_IOS_REDIRECT_URI');
    expect(create).not.toHaveBeenCalled();
  });
});
