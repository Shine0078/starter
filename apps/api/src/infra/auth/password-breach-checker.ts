import { createHash } from 'node:crypto';

import type {
  PasswordBreachChecker,
  PasswordBreachResult,
} from '../../ports/auth';

const HIBP_RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_CACHE_MAX_ENTRIES = 128;
const MAX_RANGE_RESPONSE_BYTES = 2 * 1_024 * 1_024;

type FetchLike = typeof fetch;

interface RangeCacheEntry {
  suffixes: Map<string, number>;
  expiresAt: number;
}

export interface HaveIBeenPwnedPasswordBreachCheckerOptions {
  required: boolean;
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

/**
 * Uses HIBP's free password range endpoint. Only the first five hexadecimal
 * characters of the SHA-1 digest cross the network; the full digest and the
 * plaintext stay in this process. Add-Padding makes response sizes less useful
 * for traffic analysis. SHA-1 is used solely because it is HIBP's range-index
 * protocol, never as FINVERSE's password hash (that remains Argon2id).
 */
export class HaveIBeenPwnedPasswordBreachChecker
    implements PasswordBreachChecker {
  readonly required: boolean;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly ranges = new Map<string, RangeCacheEntry>();
  private readonly inFlight = new Map<string, Promise<Map<string, number>>>();

  constructor(options: HaveIBeenPwnedPasswordBreachCheckerOptions) {
    this.required = options.required;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.cacheMaxEntries = options.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  }

  async check(password: string): Promise<PasswordBreachResult> {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    try {
      const occurrences = (await this.range(prefix)).get(suffix);
      return occurrences === undefined
        ? { kind: 'safe' }
        : { kind: 'compromised', occurrences };
    } catch {
      // Do not include a password, digest, prefix, or provider response in a
      // log line. The auth service decides whether this availability failure
      // is fail-closed (production) or best-effort (development).
      return { kind: 'unavailable' };
    }
  }

  private async range(prefix: string): Promise<Map<string, number>> {
    const cached = this.ranges.get(prefix);
    if (cached && cached.expiresAt > this.now()) return cached.suffixes;
    this.ranges.delete(prefix);

    const active = this.inFlight.get(prefix);
    if (active) return active;

    const request = this.fetchRange(prefix);
    this.inFlight.set(prefix, request);
    try {
      const suffixes = await request;
      this.storeRange(prefix, suffixes);
      return suffixes;
    } finally {
      this.inFlight.delete(prefix);
    }
  }

  private async fetchRange(prefix: string): Promise<Map<string, number>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${HIBP_RANGE_ENDPOINT}${prefix}`, {
        headers: {
          Accept: 'text/plain',
          'Add-Padding': 'true',
          'User-Agent': 'FINVERSE password safety check',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HIBP range response was ${response.status}.`);

      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RANGE_RESPONSE_BYTES) {
        throw new Error('HIBP range response exceeded the size limit.');
      }
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_RANGE_RESPONSE_BYTES) {
        throw new Error('HIBP range response exceeded the size limit.');
      }
      return parseRange(body);
    } finally {
      clearTimeout(timeout);
    }
  }

  private storeRange(prefix: string, suffixes: Map<string, number>): void {
    if (this.ranges.size >= this.cacheMaxEntries) {
      const oldest = this.ranges.keys().next().value;
      if (oldest) this.ranges.delete(oldest);
    }
    this.ranges.set(prefix, {
      suffixes,
      expiresAt: this.now() + this.cacheTtlMs,
    });
  }
}

/** Explicit local-development adapter: no candidate information leaves the process. */
export class DisabledPasswordBreachChecker implements PasswordBreachChecker {
  readonly required = false;

  async check(_password: string): Promise<PasswordBreachResult> {
    return { kind: 'safe' };
  }
}

export function parseRange(body: string): Map<string, number> {
  const suffixes = new Map<string, number>();
  for (const row of body.split(/\r?\n/)) {
    const [suffix, rawOccurrences, ...extra] = row.trim().split(':');
    if (
      extra.length > 0 ||
      !/^[A-F0-9]{35}$/.test(suffix ?? '') ||
      !/^\d+$/.test(rawOccurrences ?? '')
    ) {
      continue;
    }
    const occurrences = Number(rawOccurrences);
    if (Number.isSafeInteger(occurrences)) suffixes.set(suffix!, occurrences);
  }
  return suffixes;
}
