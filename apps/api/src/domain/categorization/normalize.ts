/**
 * Bank descriptors are hostile. Before anything can match against them they have
 * to be reduced to something stable.
 *
 *   SQ *BLUE BOTTLE 0093 SAN FRAN CA   ->  blue bottle
 *   AMZN Mktp US*2K4L9RT21             ->  amzn mktp us
 *   TST* SWEETGREEN 1042               ->  sweetgreen
 *   POS DEBIT SHELL OIL 574812 TX      ->  shell oil
 *
 * The same descriptor must always normalize to the same string, because user
 * rules (ADR-0004 tier 1) are keyed on the result. Changing this function
 * changes what existing rules match — treat it as a migration, not a tweak.
 */

/** Payment-processor and channel prefixes that carry no merchant information. */
const PREFIXES = [
  'sq *',
  'sq*',
  'tst*',
  'tst *',
  'paypal *',
  'pp*',
  'pp *',
  'sp *',
  'sp*',
  'pos debit',
  'pos purchase',
  'debit card purchase',
  'card purchase',
  'recurring payment',
  'preauthorized debit',
  'point of sale',
  'purchase authorized on',
  'checkcard',
  'visa purchase',
  'ach debit',
  'ach credit',
  'direct debit',
  'web payment',
];

/**
 * Trailing two-letter US state / CA province, e.g. "... SAN FRAN CA".
 *
 * Only the state token is stripped. Removing the city too would need a
 * gazetteer: a positional rule ("drop the last two words") turns
 * "shell oil tx" into "shell", which is worse than leaving the city in.
 * The leftover city costs us nothing — the lexicon matches on substrings.
 */
const REGION_TAIL =
  /\s+(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|ab|bc|mb|nb|nl|ns|on|pe|qc|sk)$/;

export function normalizeDescriptor(raw: string): string {
  let s = raw.toLowerCase().trim();

  // Strip a leading processor prefix. Only one — descriptors rarely stack them.
  for (const prefix of PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length).trim();
      break;
    }
  }

  // "AMZN Mktp US*2K4L9RT21" -> the reference after '*' is noise.
  const star = s.indexOf('*');
  if (star > 0) {
    s = s.slice(0, star).trim();
  }

  s = s
    // Card/reference tails: "xxxxxx1234", "####1234"
    .replace(/[x#*]{2,}\d+/g, ' ')
    // Dates embedded by some issuers: "03/14", "2026-03-14"
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    // Punctuation that never carries meaning here
    .replace(/[#*_|\\/]+/g, ' ')
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Store and reference numbers anywhere in the string, not just at the end:
  // "blue bottle 0093 san fran" and "chipotle 2984 san jose" both carry the
  // branch id in the middle. Leaving it in makes a user rule match one store
  // instead of the merchant, which quietly defeats the tier-1 guarantee.
  // Two or more digits, so "7 eleven" survives.
  s = s.replace(/\b\d{2,}\b/g, ' ').replace(/\s+/g, ' ').trim();

  // Region tail, applied after number stripping so the state is at the end.
  s = s.replace(REGION_TAIL, '').trim();

  return s;
}

/**
 * Tokens for fuzzy matching. Single characters and pure digits are dropped —
 * they generate false positives without adding signal.
 */
export function descriptorTokens(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter((t) => t.length > 1 && !/^\d+$/.test(t));
}
