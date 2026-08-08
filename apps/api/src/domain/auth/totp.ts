import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpAt(secret: string, at: Date): { code: string; step: number } {
  const step = Math.floor(at.getTime() / 1_000 / TOTP_PERIOD_SECONDS);
  return { code: totpForStep(secret, step), step };
}

export function verifyTotp(
  secret: string,
  candidate: string,
  at: Date,
  window = 1,
): number | null {
  if (!/^\d{6}$/.test(candidate)) return null;
  const current = Math.floor(at.getTime() / 1_000 / TOTP_PERIOD_SECONDS);
  const supplied = Buffer.from(candidate, 'ascii');
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    const expected = Buffer.from(totpForStep(secret, step), 'ascii');
    if (timingSafeEqual(supplied, expected)) return step;
  }
  return null;
}

export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`FINVERSE:${email}`);
  const issuer = encodeURIComponent('FINVERSE');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function totpForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = ((digest[offset] ?? 0) & 0x7f) * 0x1000000 +
    (digest[offset + 1] ?? 0) * 0x10000 +
    (digest[offset + 2] ?? 0) * 0x100 +
    (digest[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, '0');
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value: string): Buffer {
  if (!/^[A-Z2-7]+$/.test(value)) throw new Error('Invalid TOTP secret.');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value) {
    const index = ALPHABET.indexOf(character);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
