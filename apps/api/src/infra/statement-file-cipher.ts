import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { StatementFileCipher } from '../ports/statement-import';

/** AES-256-GCM envelope for uploaded statement bytes (base64 payload). */
export class AesGcmStatementFileCipher implements StatementFileCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('STATEMENT_IMPORT_ENCRYPTION_KEY must decode to 32 bytes.');
  }

  static fromBase64(value: string): AesGcmStatementFileCipher {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('STATEMENT_IMPORT_ENCRYPTION_KEY must be canonical base64.');
    const key = Buffer.from(value, 'base64');
    if (key.toString('base64') !== value || key.length !== 32) throw new Error('STATEMENT_IMPORT_ENCRYPTION_KEY must encode exactly 32 bytes.');
    return new AesGcmStatementFileCipher(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(value: string): string {
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported statement ciphertext.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(parts[1]!, 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'base64url')), decipher.final()]).toString('utf8');
  }
}
