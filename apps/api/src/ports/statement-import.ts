export interface StatementFileCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
