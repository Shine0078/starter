/**
 * Canonical transaction labels. Keeping this pure makes the same limits easy
 * to exercise in API and store-contract tests and prevents two spellings of a
 * label from splitting a user's reports.
 */
export function normalizeTransactionTags(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('tags must be an array');
  if (input.length > 20) throw new Error('a transaction can have at most 20 tags');

  const normalized = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') throw new Error('each tag must be text');
    const tag = raw.trim().toLowerCase();
    if (tag.length < 1 || tag.length > 40) {
      throw new Error('each tag must be from 1 through 40 characters');
    }
    normalized.add(tag);
  }
  return [...normalized].sort((left, right) => left.localeCompare(right));
}
