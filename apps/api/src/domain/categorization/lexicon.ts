/**
 * Tier 2 of ADR-0004: a curated merchant → category map.
 *
 * This is a seed set, not a finished lexicon. Production needs roughly the top
 * 2,000 merchants per market to cover the bulk of transaction volume, and the
 * list is regional — a US lexicon performs poorly in Canada or the UK.
 *
 * Confidence is per-entry because certainty genuinely varies. "netflix" is
 * unambiguous. "target" is a store that sells groceries, clothing, and
 * electronics, so its category is a guess that a user rule should override.
 */

export interface LexiconEntry {
  /** Substring matched against the normalized descriptor. */
  match: string;
  categorySlug: string;
  /** 0.7–0.95. Above 0.95 is reserved for user rules. */
  confidence: number;
  merchant: string;
}

export const MERCHANT_LEXICON: readonly LexiconEntry[] = [
  // Coffee
  { match: 'starbucks', categorySlug: 'coffee', confidence: 0.95, merchant: 'Starbucks' },
  { match: 'blue bottle', categorySlug: 'coffee', confidence: 0.95, merchant: 'Blue Bottle' },
  { match: 'dunkin', categorySlug: 'coffee', confidence: 0.93, merchant: 'Dunkin' },
  { match: 'tim hortons', categorySlug: 'coffee', confidence: 0.9, merchant: 'Tim Hortons' },
  { match: 'peets', categorySlug: 'coffee', confidence: 0.94, merchant: "Peet's Coffee" },

  // Groceries
  { match: 'whole foods', categorySlug: 'groceries', confidence: 0.95, merchant: 'Whole Foods' },
  { match: 'trader joe', categorySlug: 'groceries', confidence: 0.95, merchant: "Trader Joe's" },
  { match: 'safeway', categorySlug: 'groceries', confidence: 0.93, merchant: 'Safeway' },
  { match: 'kroger', categorySlug: 'groceries', confidence: 0.93, merchant: 'Kroger' },
  { match: 'aldi', categorySlug: 'groceries', confidence: 0.92, merchant: 'Aldi' },
  { match: 'loblaws', categorySlug: 'groceries', confidence: 0.92, merchant: 'Loblaws' },
  { match: 'costco', categorySlug: 'groceries', confidence: 0.75, merchant: 'Costco' },
  { match: 'target', categorySlug: 'shopping', confidence: 0.7, merchant: 'Target' },
  { match: 'walmart', categorySlug: 'groceries', confidence: 0.72, merchant: 'Walmart' },

  // Restaurants & delivery
  { match: 'sweetgreen', categorySlug: 'restaurants', confidence: 0.93, merchant: 'Sweetgreen' },
  { match: 'chipotle', categorySlug: 'fast_food', confidence: 0.94, merchant: 'Chipotle' },
  { match: 'mcdonald', categorySlug: 'fast_food', confidence: 0.95, merchant: "McDonald's" },
  { match: 'doordash', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'DoorDash' },
  { match: 'uber eats', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'Uber Eats' },
  { match: 'ubereats', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'Uber Eats' },
  { match: 'grubhub', categorySlug: 'food_delivery', confidence: 0.94, merchant: 'Grubhub' },
  { match: 'skip the dishes', categorySlug: 'food_delivery', confidence: 0.93, merchant: 'SkipTheDishes' },

  // Transport
  // "uber" must come after "uber eats" — first match wins, and an Uber Eats
  // charge is food, not a ride.
  { match: 'uber', categorySlug: 'rideshare', confidence: 0.88, merchant: 'Uber' },
  { match: 'lyft', categorySlug: 'rideshare', confidence: 0.93, merchant: 'Lyft' },
  { match: 'shell oil', categorySlug: 'fuel', confidence: 0.94, merchant: 'Shell' },
  { match: 'shell', categorySlug: 'fuel', confidence: 0.85, merchant: 'Shell' },
  { match: 'chevron', categorySlug: 'fuel', confidence: 0.93, merchant: 'Chevron' },
  { match: 'petro canada', categorySlug: 'fuel', confidence: 0.92, merchant: 'Petro-Canada' },
  { match: 'bp ', categorySlug: 'fuel', confidence: 0.8, merchant: 'BP' },

  // Streaming & subscriptions
  { match: 'netflix', categorySlug: 'streaming', confidence: 0.95, merchant: 'Netflix' },
  { match: 'spotify', categorySlug: 'streaming', confidence: 0.95, merchant: 'Spotify' },
  { match: 'disney plus', categorySlug: 'streaming', confidence: 0.95, merchant: 'Disney+' },
  { match: 'disneyplus', categorySlug: 'streaming', confidence: 0.95, merchant: 'Disney+' },
  { match: 'hulu', categorySlug: 'streaming', confidence: 0.94, merchant: 'Hulu' },
  { match: 'youtube premium', categorySlug: 'streaming', confidence: 0.94, merchant: 'YouTube Premium' },
  { match: 'apple com bill', categorySlug: 'subscriptions', confidence: 0.8, merchant: 'Apple' },
  { match: 'github', categorySlug: 'software', confidence: 0.9, merchant: 'GitHub' },
  { match: 'adobe', categorySlug: 'software', confidence: 0.9, merchant: 'Adobe' },
  { match: 'dropbox', categorySlug: 'software', confidence: 0.92, merchant: 'Dropbox' },
  { match: 'notion', categorySlug: 'software', confidence: 0.9, merchant: 'Notion' },

  // Shopping
  { match: 'amzn mktp', categorySlug: 'shopping', confidence: 0.8, merchant: 'Amazon' },
  { match: 'amazon', categorySlug: 'shopping', confidence: 0.78, merchant: 'Amazon' },
  { match: 'best buy', categorySlug: 'electronics', confidence: 0.9, merchant: 'Best Buy' },
  { match: 'apple store', categorySlug: 'electronics', confidence: 0.88, merchant: 'Apple Store' },

  // Fitness & health
  { match: 'planet fitness', categorySlug: 'fitness', confidence: 0.94, merchant: 'Planet Fitness' },
  { match: 'equinox', categorySlug: 'fitness', confidence: 0.92, merchant: 'Equinox' },
  { match: 'cvs', categorySlug: 'pharmacy', confidence: 0.88, merchant: 'CVS' },
  { match: 'walgreens', categorySlug: 'pharmacy', confidence: 0.9, merchant: 'Walgreens' },
  { match: 'shoppers drug mart', categorySlug: 'pharmacy', confidence: 0.9, merchant: 'Shoppers Drug Mart' },

  // Bills & housing
  { match: 'comcast', categorySlug: 'internet', confidence: 0.9, merchant: 'Comcast' },
  { match: 'xfinity', categorySlug: 'internet', confidence: 0.9, merchant: 'Xfinity' },
  { match: 'verizon', categorySlug: 'phone', confidence: 0.88, merchant: 'Verizon' },
  { match: 't mobile', categorySlug: 'phone', confidence: 0.88, merchant: 'T-Mobile' },
  { match: 'rogers', categorySlug: 'phone', confidence: 0.85, merchant: 'Rogers' },
  { match: 'pg&e', categorySlug: 'utilities', confidence: 0.92, merchant: 'PG&E' },
  { match: 'con edison', categorySlug: 'utilities', confidence: 0.92, merchant: 'Con Edison' },

  // Money in / money moved
  { match: 'payroll', categorySlug: 'salary', confidence: 0.9, merchant: 'Payroll' },
  { match: 'direct dep', categorySlug: 'salary', confidence: 0.88, merchant: 'Direct Deposit' },
  { match: 'interest paid', categorySlug: 'interest_income', confidence: 0.9, merchant: 'Interest' },
  { match: 'transfer to savings', categorySlug: 'savings', confidence: 0.9, merchant: 'Savings Transfer' },
  { match: 'vanguard', categorySlug: 'investments', confidence: 0.9, merchant: 'Vanguard' },
  { match: 'coinbase', categorySlug: 'investments', confidence: 0.85, merchant: 'Coinbase' },

  // Fees
  { match: 'overdraft fee', categorySlug: 'fees', confidence: 0.95, merchant: 'Overdraft Fee' },
  { match: 'interest charge', categorySlug: 'fees', confidence: 0.95, merchant: 'Interest Charge' },
  { match: 'late fee', categorySlug: 'fees', confidence: 0.95, merchant: 'Late Fee' },
  { match: 'annual fee', categorySlug: 'fees', confidence: 0.93, merchant: 'Annual Fee' },
];

/**
 * Entries sorted longest-match-first, so "uber eats" is tested before "uber"
 * and "shell oil" before "shell". Relying on array order alone would make the
 * lexicon fragile to reordering during edits.
 */
export const LEXICON_BY_SPECIFICITY: readonly LexiconEntry[] = [...MERCHANT_LEXICON].sort(
  (a, b) => b.match.length - a.match.length,
);
