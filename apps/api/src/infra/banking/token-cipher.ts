import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { BankTokenCipher } from '../../ports/banking';

export class AesGcmBankTokenCipher implements BankTokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('BANK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  static fromBase64(value: string): AesGcmBankTokenCipher {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new Error('BANK_TOKEN_ENCRYPTION_KEY must be canonical base64.');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
      throw new Error('BANK_TOKEN_ENCRYPTION_KEY must be canonical base64.');
    }
    return new AesGcmBankTokenCipher(decoded);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  }

  decrypt(value: string): string {
    const parts = value.split('.');
    const [version, iv, tag, ciphertext] = parts;
    if (parts.length !== 4 || version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new Error('Unsupported bank-token ciphertext.');
    }
    const ivBytes = decodeBase64Url(iv);
    const tagBytes = decodeBase64Url(tag);
    const ciphertextBytes = decodeBase64Url(ciphertext);
    if (ivBytes.length !== 12 || tagBytes.length !== 16) {
      throw new Error('Invalid bank-token ciphertext.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, ivBytes);
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([
      decipher.update(ciphertextBytes),
      decipher.final(),
    ]).toString('utf8');
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid bank-token ciphertext.');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('Invalid bank-token ciphertext.');
  return decoded;
}
