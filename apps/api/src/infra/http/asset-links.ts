export interface AndroidAssetLinkConfig {
  packageName: string;
  sha256CertFingerprints: string[];
}

const FINGERPRINT = /^[A-F0-9]{2}(?::[A-F0-9]{2}){31}$/;

export function parseAndroidAssetLinkConfig(): AndroidAssetLinkConfig | undefined {
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (fingerprints.length === 0) return undefined;
  if (fingerprints.some((value) => !FINGERPRINT.test(value))) {
    throw new Error('ANDROID_CERT_FINGERPRINTS must be comma-separated SHA-256 fingerprints such as AA:BB:...');
  }
  return {
    packageName: process.env.ANDROID_PACKAGE_NAME?.trim() || 'com.finverse.finance',
    sha256CertFingerprints: fingerprints,
  };
}

export function androidAssetLinks(config: AndroidAssetLinkConfig) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'android_app',
        package_name: config.packageName,
        sha256_cert_fingerprints: config.sha256CertFingerprints,
      },
    },
  ];
}
