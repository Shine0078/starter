import { describe, expect, it } from 'vitest';

import { AesGcmStatementFileCipher } from '../src/infra/statement-file-cipher';

describe('statement file encryption', () => {
  it('uses authenticated encryption and rejects tampering', () => {
    const cipher = AesGcmStatementFileCipher.fromBase64(Buffer.alloc(32, 7).toString('base64'));
    const encrypted = cipher.encrypt(Buffer.from('private statement bytes').toString('base64'));
    expect(encrypted).not.toContain('private statement bytes');
    expect(cipher.decrypt(encrypted)).toBe(Buffer.from('private statement bytes').toString('base64'));
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]}a`;
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });
});
