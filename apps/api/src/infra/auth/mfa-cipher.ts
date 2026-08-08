import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { MfaSecretCipher } from '../../ports/auth';

export class AesGcmMfaSecretCipher implements MfaSecretCipher {
  readonly available = true;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  static fromBase64(value: string): AesGcmMfaSecretCipher {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new Error('MFA_ENCRYPTION_KEY must be canonical base64.');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
      throw new Error('MFA_ENCRYPTION_KEY must be canonical base64.');
    }
    return new AesGcmMfaSecretCipher(decoded);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, ciphertext, extra] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('Unsupported MFA ciphertext.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }
}

export class UnavailableMfaSecretCipher implements MfaSecretCipher {
  readonly available = false;
  encrypt(_plaintext: string): string { throw new Error('MFA encryption is not configured.'); }
  decrypt(_ciphertext: string): string { throw new Error('MFA encryption is not configured.'); }
}
