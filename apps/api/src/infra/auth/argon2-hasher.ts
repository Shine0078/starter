import { Algorithm, hash, verify } from '@node-rs/argon2';

import type { PasswordHasher } from '../../ports/auth';

/**
 * Argon2id password hashing.
 *
 * Parameters are OWASP's recommended Argon2id baseline: 19 MiB of memory,
 * 2 iterations, 1 lane. They are written out rather than left to the library
 * default so that a future library upgrade cannot silently weaken them, and so
 * that `needsRehash` has something concrete to compare against.
 *
 * Argon2id (rather than Argon2i or Argon2d) is the deliberate choice: it is the
 * variant designed to resist both GPU cracking and side-channel attacks, and is
 * what RFC 9106 recommends when you have no specific reason to pick another.
 */
const MEMORY_COST_KIB = 19_456;
const TIME_COST = 2;
const PARALLELISM = 1;

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: MEMORY_COST_KIB,
      timeCost: TIME_COST,
      parallelism: PARALLELISM,
    });
  }

  async verify(hashed: string, password: string): Promise<boolean> {
    try {
      return await verify(hashed, password);
    } catch {
      // A malformed or truncated hash in the database must read as "wrong
      // password", not as a 500 that tells an attacker the record is unusual.
      return false;
    }
  }

  /**
   * Detects hashes produced with weaker parameters so they can be upgraded on
   * the next successful login — the only moment the plaintext is available.
   */
  needsRehash(hashed: string): boolean {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hashed);
    if (!match) return true; // not argon2id at all, or unparseable

    const [, memory, time, lanes] = match;
    return (
      Number(memory) < MEMORY_COST_KIB ||
      Number(time) < TIME_COST ||
      Number(lanes) < PARALLELISM
    );
  }
}
