import { describe, expect, it } from 'vitest';

import { appleAppSiteAssociation } from '../src/infra/http/apple-app-site-association';

describe('Apple App Site Association', () => {
  it('matches only the FINVERSE Plaid callback path', () => {
    expect(
      appleAppSiteAssociation({
        appId: 'A1B2C3D4E5.com.finverse.finance',
        pathPrefix: '/plaid/',
      }),
    ).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['A1B2C3D4E5.com.finverse.finance'],
            components: [{ '/': '/plaid/*' }],
          },
        ],
      },
    });
  });
});
