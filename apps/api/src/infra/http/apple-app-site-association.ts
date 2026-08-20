import type { IosUniversalLinkConfig } from '../../config';

/** Build the JSON Apple fetches for a Universal Link association. */
export function appleAppSiteAssociation(
  config: Pick<IosUniversalLinkConfig, 'appId' | 'pathPrefix'>,
) {
  return {
    applinks: {
      details: [
        {
          appIDs: [config.appId],
          components: [{ '/': `${config.pathPrefix}*` }],
        },
      ],
    },
    webcredentials: {
      apps: [config.appId],
    },
  };
}
