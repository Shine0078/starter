import { describe, expect, it } from 'vitest';

import { androidAssetLinks, parseAndroidAssetLinkConfig } from '../src/infra/http/asset-links';

describe('Android Digital Asset Links', () => {
  it('stays off until fingerprints are configured', () => {
    const previous = process.env.ANDROID_CERT_FINGERPRINTS;
    delete process.env.ANDROID_CERT_FINGERPRINTS;
    expect(parseAndroidAssetLinkConfig()).toBeUndefined();
    if (previous === undefined) delete process.env.ANDROID_CERT_FINGERPRINTS;
    else process.env.ANDROID_CERT_FINGERPRINTS = previous;
  });

  it('builds a handle_all_urls and get_login_creds statement', () => {
    expect(
      androidAssetLinks({
        packageName: 'com.finverse.finance',
        sha256CertFingerprints: ['AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'],
      }),
    ).toEqual([
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: 'com.finverse.finance',
          sha256_cert_fingerprints: [
            'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
          ],
        },
      },
    ]);
  });
});
