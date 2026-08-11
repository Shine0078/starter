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
  { match: 'second cup', categorySlug: 'coffee', confidence: 0.92, merchant: 'Second Cup' },
  { match: 'caribou', categorySlug: 'coffee', confidence: 0.9, merchant: 'Caribou Coffee' },
  { match: 'nespresso', categorySlug: 'coffee', confidence: 0.85, merchant: 'Nespresso' },

  // Groceries
  { match: 'whole foods', categorySlug: 'groceries', confidence: 0.95, merchant: 'Whole Foods' },
  { match: 'trader joe', categorySlug: 'groceries', confidence: 0.95, merchant: "Trader Joe's" },
  { match: 'safeway', categorySlug: 'groceries', confidence: 0.93, merchant: 'Safeway' },
  { match: 'kroger', categorySlug: 'groceries', confidence: 0.93, merchant: 'Kroger' },
  { match: 'aldi', categorySlug: 'groceries', confidence: 0.92, merchant: 'Aldi' },
  { match: 'publix', categorySlug: 'groceries', confidence: 0.93, merchant: 'Publix' },
  { match: 'wegmans', categorySlug: 'groceries', confidence: 0.93, merchant: 'Wegmans' },
  { match: 'meijer', categorySlug: 'groceries', confidence: 0.9, merchant: 'Meijer' },
  { match: 'heb ', categorySlug: 'groceries', confidence: 0.9, merchant: 'HEB' },
  { match: 'giant eagle', categorySlug: 'groceries', confidence: 0.91, merchant: 'Giant Eagle' },
  { match: 'loblaws', categorySlug: 'groceries', confidence: 0.92, merchant: 'Loblaws' },
  { match: 'metro', categorySlug: 'groceries', confidence: 0.85, merchant: 'Metro' },
  { match: 'sobeys', categorySlug: 'groceries', confidence: 0.92, merchant: 'Sobeys' },
  { match: 'no frills', categorySlug: 'groceries', confidence: 0.9, merchant: 'No Frills' },
  { match: 'freshco', categorySlug: 'groceries', confidence: 0.9, merchant: 'FreshCo' },
  { match: 'costco', categorySlug: 'groceries', confidence: 0.75, merchant: 'Costco' },
  { match: 'target', categorySlug: 'shopping', confidence: 0.7, merchant: 'Target' },
  { match: 'walmart', categorySlug: 'groceries', confidence: 0.72, merchant: 'Walmart' },

  // Restaurants & delivery
  { match: 'sweetgreen', categorySlug: 'restaurants', confidence: 0.93, merchant: 'Sweetgreen' },
  { match: 'chipotle', categorySlug: 'fast_food', confidence: 0.94, merchant: 'Chipotle' },
  { match: 'mcdonald', categorySlug: 'fast_food', confidence: 0.95, merchant: "McDonald's" },
  { match: 'panera', categorySlug: 'restaurants', confidence: 0.92, merchant: 'Panera Bread' },
  { match: 'chick fil a', categorySlug: 'fast_food', confidence: 0.94, merchant: "Chick-fil-A" },
  { match: 'chick-fil-a', categorySlug: 'fast_food', confidence: 0.94, merchant: "Chick-fil-A" },
  { match: 'subway', categorySlug: 'fast_food', confidence: 0.9, merchant: 'Subway' },
  { match: 'taco bell', categorySlug: 'fast_food', confidence: 0.93, merchant: 'Taco Bell' },
  { match: 'wendy', categorySlug: 'fast_food', confidence: 0.93, merchant: "Wendy's" },
  { match: 'burger king', categorySlug: 'fast_food', confidence: 0.93, merchant: 'Burger King' },
  { match: 'kfc', categorySlug: 'fast_food', confidence: 0.9, merchant: 'KFC' },
  { match: 'pizza hut', categorySlug: 'fast_food', confidence: 0.92, merchant: 'Pizza Hut' },
  { match: 'domino', categorySlug: 'fast_food', confidence: 0.92, merchant: "Domino's" },
  { match: 'five guys', categorySlug: 'fast_food', confidence: 0.92, merchant: "Five Guys" },
  { match: 'in n out', categorySlug: 'fast_food', confidence: 0.92, merchant: 'In-N-Out' },
  { match: 'shake shack', categorySlug: 'fast_food', confidence: 0.92, merchant: 'Shake Shack' },
  { match: 'olive garden', categorySlug: 'restaurants', confidence: 0.93, merchant: 'Olive Garden' },
  { match: 'cheesecake factory', categorySlug: 'restaurants', confidence: 0.93, merchant: 'The Cheesecake Factory' },
  { match: 'outback', categorySlug: 'restaurants', confidence: 0.91, merchant: 'Outback Steakhouse' },
  { match: 'doordash', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'DoorDash' },
  { match: 'uber eats', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'Uber Eats' },
  { match: 'ubereats', categorySlug: 'food_delivery', confidence: 0.95, merchant: 'Uber Eats' },
  { match: 'grubhub', categorySlug: 'food_delivery', confidence: 0.94, merchant: 'Grubhub' },
  { match: 'postmates', categorySlug: 'food_delivery', confidence: 0.93, merchant: 'Postmates' },
  { match: 'instacart', categorySlug: 'food_delivery', confidence: 0.93, merchant: 'Instacart' },
  { match: 'hello fresh', categorySlug: 'food_delivery', confidence: 0.92, merchant: 'HelloFresh' },
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
  { match: 'exxon', categorySlug: 'fuel', confidence: 0.93, merchant: 'ExxonMobil' },
  { match: 'mobil', categorySlug: 'fuel', confidence: 0.92, merchant: 'Mobil' },
  { match: 'esso', categorySlug: 'fuel', confidence: 0.92, merchant: 'Esso' },
  { match: 'texaco', categorySlug: 'fuel', confidence: 0.92, merchant: 'Texaco' },
  { match: 'sunoco', categorySlug: 'fuel', confidence: 0.92, merchant: 'Sunoco' },
  { match: 'speedway', categorySlug: 'fuel', confidence: 0.9, merchant: 'Speedway' },
  { match: 'marathon petroleum', categorySlug: 'fuel', confidence: 0.9, merchant: 'Marathon' },
  { match: 'spothero', categorySlug: 'parking', confidence: 0.92, merchant: 'SpotHero' },
  { match: 'parkmobile', categorySlug: 'parking', confidence: 0.92, merchant: 'ParkMobile' },

  // Streaming & subscriptions
  { match: 'netflix', categorySlug: 'streaming', confidence: 0.95, merchant: 'Netflix' },
  { match: 'spotify', categorySlug: 'streaming', confidence: 0.95, merchant: 'Spotify' },
  { match: 'disney plus', categorySlug: 'streaming', confidence: 0.95, merchant: 'Disney+' },
  { match: 'disneyplus', categorySlug: 'streaming', confidence: 0.95, merchant: 'Disney+' },
  { match: 'hulu', categorySlug: 'streaming', confidence: 0.94, merchant: 'Hulu' },
  { match: 'youtube premium', categorySlug: 'streaming', confidence: 0.94, merchant: 'YouTube Premium' },
  { match: 'paramount plus', categorySlug: 'streaming', confidence: 0.94, merchant: 'Paramount+' },
  { match: 'peacock', categorySlug: 'streaming', confidence: 0.93, merchant: 'Peacock' },
  { match: 'hbo max', categorySlug: 'streaming', confidence: 0.94, merchant: 'HBO Max' },
  { match: 'max', categorySlug: 'streaming', confidence: 0.85, merchant: 'Max' },
  { match: 'crave', categorySlug: 'streaming', confidence: 0.9, merchant: 'Crave' },
  { match: 'crunchyroll', categorySlug: 'streaming', confidence: 0.92, merchant: 'Crunchyroll' },
  { match: 'prime video', categorySlug: 'streaming', confidence: 0.93, merchant: 'Prime Video' },
  { match: 'apple com bill', categorySlug: 'subscriptions', confidence: 0.8, merchant: 'Apple' },
  { match: 'github', categorySlug: 'software', confidence: 0.9, merchant: 'GitHub' },
  { match: 'adobe', categorySlug: 'software', confidence: 0.9, merchant: 'Adobe' },
  { match: 'dropbox', categorySlug: 'software', confidence: 0.92, merchant: 'Dropbox' },
  { match: 'notion', categorySlug: 'software', confidence: 0.9, merchant: 'Notion' },
  { match: 'microsoft', categorySlug: 'software', confidence: 0.85, merchant: 'Microsoft' },
  { match: 'google one', categorySlug: 'software', confidence: 0.9, merchant: 'Google One' },
  { match: 'icloud', categorySlug: 'software', confidence: 0.9, merchant: 'iCloud' },
  { match: 'zoom', categorySlug: 'software', confidence: 0.88, merchant: 'Zoom' },
  { match: 'slack', categorySlug: 'software', confidence: 0.88, merchant: 'Slack' },
  { match: 'figma', categorySlug: 'software', confidence: 0.9, merchant: 'Figma' },
  { match: 'canva', categorySlug: 'software', confidence: 0.9, merchant: 'Canva' },
  { match: 'chatgpt', categorySlug: 'software', confidence: 0.9, merchant: 'ChatGPT' },
  { match: 'openai', categorySlug: 'software', confidence: 0.9, merchant: 'OpenAI' },
  { match: 'audible', categorySlug: 'subscriptions', confidence: 0.92, merchant: 'Audible' },
  { match: 'medium', categorySlug: 'subscriptions', confidence: 0.85, merchant: 'Medium' },

  // Gaming
  { match: 'steam', categorySlug: 'gaming', confidence: 0.9, merchant: 'Steam' },
  { match: 'xbox', categorySlug: 'gaming', confidence: 0.9, merchant: 'Xbox' },
  { match: 'playstation', categorySlug: 'gaming', confidence: 0.92, merchant: 'PlayStation' },
  { match: 'nintendo', categorySlug: 'gaming', confidence: 0.92, merchant: 'Nintendo' },
  { match: 'epic games', categorySlug: 'gaming', confidence: 0.92, merchant: 'Epic Games' },

  // Shopping
  { match: 'amzn mktp', categorySlug: 'shopping', confidence: 0.8, merchant: 'Amazon' },
  { match: 'amazon', categorySlug: 'shopping', confidence: 0.78, merchant: 'Amazon' },
  { match: 'best buy', categorySlug: 'electronics', confidence: 0.9, merchant: 'Best Buy' },
  { match: 'apple store', categorySlug: 'electronics', confidence: 0.88, merchant: 'Apple Store' },
  { match: 'ikea', categorySlug: 'shopping', confidence: 0.92, merchant: 'IKEA' },
  { match: 'home depot', categorySlug: 'shopping', confidence: 0.9, merchant: 'The Home Depot' },
  { match: 'lowes', categorySlug: 'shopping', confidence: 0.9, merchant: "Lowe's" },
  { match: 'nike', categorySlug: 'clothing', confidence: 0.9, merchant: 'Nike' },
  { match: 'adidas', categorySlug: 'clothing', confidence: 0.9, merchant: 'Adidas' },
  { match: 'h&m', categorySlug: 'clothing', confidence: 0.9, merchant: 'H&M' },
  { match: 'zara', categorySlug: 'clothing', confidence: 0.9, merchant: 'Zara' },
  { match: 'uniqlo', categorySlug: 'clothing', confidence: 0.92, merchant: 'Uniqlo' },
  { match: 'old navy', categorySlug: 'clothing', confidence: 0.91, merchant: 'Old Navy' },
  { match: 'gap', categorySlug: 'clothing', confidence: 0.85, merchant: 'Gap' },

  // Fitness & health
  { match: 'planet fitness', categorySlug: 'fitness', confidence: 0.94, merchant: 'Planet Fitness' },
  { match: 'equinox', categorySlug: 'fitness', confidence: 0.92, merchant: 'Equinox' },
  { match: '24 hour fitness', categorySlug: 'fitness', confidence: 0.93, merchant: '24 Hour Fitness' },
  { match: 'la fitness', categorySlug: 'fitness', confidence: 0.92, merchant: 'LA Fitness' },
  { match: 'crunch fitness', categorySlug: 'fitness', confidence: 0.92, merchant: 'Crunch Fitness' },
  { match: 'orangetheory', categorySlug: 'fitness', confidence: 0.92, merchant: 'Orangetheory' },
  { match: 'anytime fitness', categorySlug: 'fitness', confidence: 0.92, merchant: 'Anytime Fitness' },
  { match: 'goodlife fitness', categorySlug: 'fitness', confidence: 0.92, merchant: 'GoodLife Fitness' },
  { match: 'cvs', categorySlug: 'pharmacy', confidence: 0.88, merchant: 'CVS' },
  { match: 'walgreens', categorySlug: 'pharmacy', confidence: 0.9, merchant: 'Walgreens' },
  { match: 'rite aid', categorySlug: 'pharmacy', confidence: 0.9, merchant: 'Rite Aid' },
  { match: 'shoppers drug mart', categorySlug: 'pharmacy', confidence: 0.9, merchant: 'Shoppers Drug Mart' },
  { match: 'geico', categorySlug: 'insurance', confidence: 0.93, merchant: 'GEICO' },
  { match: 'progressive', categorySlug: 'insurance', confidence: 0.92, merchant: 'Progressive' },
  { match: 'state farm', categorySlug: 'insurance', confidence: 0.92, merchant: 'State Farm' },
  { match: 'allstate', categorySlug: 'insurance', confidence: 0.92, merchant: 'Allstate' },
  { match: 'liberty mutual', categorySlug: 'insurance', confidence: 0.92, merchant: 'Liberty Mutual' },

  // Bills & housing
  { match: 'comcast', categorySlug: 'internet', confidence: 0.9, merchant: 'Comcast' },
  { match: 'xfinity', categorySlug: 'internet', confidence: 0.9, merchant: 'Xfinity' },
  { match: 'spectrum', categorySlug: 'internet', confidence: 0.88, merchant: 'Spectrum' },
  { match: 'cox communications', categorySlug: 'internet', confidence: 0.9, merchant: 'Cox' },
  { match: 'verizon', categorySlug: 'phone', confidence: 0.88, merchant: 'Verizon' },
  { match: 'at&t', categorySlug: 'phone', confidence: 0.88, merchant: 'AT&T' },
  { match: 'att ', categorySlug: 'phone', confidence: 0.8, merchant: 'AT&T' },
  { match: 't mobile', categorySlug: 'phone', confidence: 0.88, merchant: 'T-Mobile' },
  { match: 'rogers', categorySlug: 'phone', confidence: 0.85, merchant: 'Rogers' },
  { match: 'bell', categorySlug: 'phone', confidence: 0.85, merchant: 'Bell' },
  { match: 'telus', categorySlug: 'phone', confidence: 0.85, merchant: 'Telus' },
  { match: 'fido', categorySlug: 'phone', confidence: 0.9, merchant: 'Fido' },
  { match: 'koodo', categorySlug: 'phone', confidence: 0.9, merchant: 'Koodo' },
  { match: 'pg&e', categorySlug: 'utilities', confidence: 0.92, merchant: 'PG&E' },
  { match: 'con edison', categorySlug: 'utilities', confidence: 0.92, merchant: 'Con Edison' },
  { match: 'duke energy', categorySlug: 'utilities', confidence: 0.92, merchant: 'Duke Energy' },
  { match: 'hydro one', categorySlug: 'utilities', confidence: 0.92, merchant: 'Hydro One' },
  { match: 'hydro quebec', categorySlug: 'utilities', confidence: 0.92, merchant: 'Hydro-Québec' },
  { match: 'bc hydro', categorySlug: 'utilities', confidence: 0.92, merchant: 'BC Hydro' },

  // Travel
  { match: 'airbnb', categorySlug: 'travel', confidence: 0.93, merchant: 'Airbnb' },
  { match: 'expedia', categorySlug: 'travel', confidence: 0.93, merchant: 'Expedia' },
  { match: 'booking.com', categorySlug: 'travel', confidence: 0.92, merchant: 'Booking.com' },
  { match: 'kayak', categorySlug: 'travel', confidence: 0.88, merchant: 'Kayak' },
  { match: 'delta air', categorySlug: 'travel', confidence: 0.93, merchant: 'Delta Air Lines' },
  { match: 'united airlines', categorySlug: 'travel', confidence: 0.93, merchant: 'United Airlines' },
  { match: 'american airlines', categorySlug: 'travel', confidence: 0.93, merchant: 'American Airlines' },
  { match: 'air canada', categorySlug: 'travel', confidence: 0.93, merchant: 'Air Canada' },
  { match: 'westjet', categorySlug: 'travel', confidence: 0.93, merchant: 'WestJet' },
  { match: 'jetblue', categorySlug: 'travel', confidence: 0.92, merchant: 'JetBlue' },
  { match: 'southwest airlines', categorySlug: 'travel', confidence: 0.92, merchant: 'Southwest Airlines' },
  { match: 'marriott', categorySlug: 'travel', confidence: 0.9, merchant: 'Marriott' },
  { match: 'hilton', categorySlug: 'travel', confidence: 0.9, merchant: 'Hilton' },
  { match: 'hyatt', categorySlug: 'travel', confidence: 0.9, merchant: 'Hyatt' },

  // Money in / money moved
  { match: 'payroll', categorySlug: 'salary', confidence: 0.9, merchant: 'Payroll' },
  { match: 'direct dep', categorySlug: 'salary', confidence: 0.88, merchant: 'Direct Deposit' },
  { match: 'paypal', categorySlug: 'freelance', confidence: 0.7, merchant: 'PayPal' },
  { match: 'upwork', categorySlug: 'freelance', confidence: 0.92, merchant: 'Upwork' },
  { match: 'fiverr', categorySlug: 'freelance', confidence: 0.92, merchant: 'Fiverr' },
  { match: 'interest paid', categorySlug: 'interest_income', confidence: 0.9, merchant: 'Interest' },
  { match: 'transfer to savings', categorySlug: 'savings', confidence: 0.9, merchant: 'Savings Transfer' },
  { match: 'vanguard', categorySlug: 'investments', confidence: 0.9, merchant: 'Vanguard' },
  { match: 'fidelity', categorySlug: 'investments', confidence: 0.9, merchant: 'Fidelity' },
  { match: 'coinbase', categorySlug: 'investments', confidence: 0.85, merchant: 'Coinbase' },
  { match: 'robinhood', categorySlug: 'investments', confidence: 0.9, merchant: 'Robinhood' },
  { match: 'wealthsimple', categorySlug: 'investments', confidence: 0.9, merchant: 'Wealthsimple' },

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
