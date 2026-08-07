/**
 * A mock aggregator standing in for Plaid / Flinks / TrueLayer.
 *
 * It exists so the whole pipeline can be exercised end to end without a bank
 * connection — which is gated on commercial agreements, not code (see
 * docs/04-roadmap.md). It deliberately emits the messy descriptors real banks
 * send, because clean data would make the categorizer look better than it is.
 *
 * Generation is seeded and therefore deterministic: the same `today` and seed
 * always produce the same ledger, so tests and demos are reproducible.
 */

import { addDays, daysInMonth } from '../domain/dates';
import type { Account, IsoDate, RawTransaction } from '../domain/types';
import type { AggregatorPort } from '../ports';

/** Mulberry32 — small, fast, good enough for fixtures, and reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_ACCOUNTS: readonly Account[] = [
  {
    id: 'acc_checking',
    name: 'Everyday Checking',
    type: 'checking',
    mask: '4412',
    currency: 'USD',
    balanceCurrent: 384_512,
  },
  {
    id: 'acc_savings',
    name: 'High-Yield Savings',
    type: 'savings',
    mask: '9087',
    currency: 'USD',
    balanceCurrent: 612_000,
  },
  {
    id: 'acc_credit',
    name: 'Rewards Visa',
    type: 'credit_card',
    mask: '6411',
    currency: 'USD',
    // Negative: money owed.
    balanceCurrent: -142_300,
    creditLimit: 500_000,
    statementDay: 18,
    paymentDueDay: 12,
  },
];

interface RecurringSpec {
  descriptor: string;
  accountId: string;
  /** Minor units, signed. */
  amount: number;
  /** Day of month it lands. */
  day: number;
  /** Optional raise applied from this month index onward (0 = oldest month). */
  priceChange?: { fromMonthIndex: number; newAmount: number };
}

const RECURRING: readonly RecurringSpec[] = [
  { descriptor: 'ACME CORP PAYROLL DIRECT DEP', accountId: 'acc_checking', amount: 512_000, day: 1 },
  { descriptor: 'ACME CORP PAYROLL DIRECT DEP', accountId: 'acc_checking', amount: 512_000, day: 15 },
  { descriptor: 'SUNSET RIDGE APARTMENTS RENT', accountId: 'acc_checking', amount: -218_000, day: 3 },
  { descriptor: 'COMCAST XFINITY 8009341', accountId: 'acc_checking', amount: -8_999, day: 7 },
  { descriptor: 'VERIZON WIRELESS PMT', accountId: 'acc_checking', amount: -7_540, day: 9 },
  { descriptor: 'PG&E ENERGY STATEMENT', accountId: 'acc_checking', amount: -11_240, day: 11 },
  {
    descriptor: 'NETFLIX.COM 8887638',
    accountId: 'acc_credit',
    amount: -1_549,
    day: 14,
    // A real price increase, so the subscription detector has something to find.
    priceChange: { fromMonthIndex: 2, newAmount: -1_799 },
  },
  { descriptor: 'Spotify USA 8778117', accountId: 'acc_credit', amount: -1_199, day: 6 },
  { descriptor: 'PLANET FITNESS CLUB FEE', accountId: 'acc_credit', amount: -2_499, day: 17 },
  { descriptor: 'GITHUB.COM 4155555', accountId: 'acc_credit', amount: -1_000, day: 22 },
  { descriptor: 'TRANSFER TO SAVINGS XXXXXX9087', accountId: 'acc_checking', amount: -40_000, day: 16 },
];

interface VariableSpec {
  descriptors: readonly string[];
  accountId: string;
  /** Minor units, positive; the generator negates. */
  min: number;
  max: number;
  /** Roughly how many per month. */
  perMonth: number;
}

const VARIABLE: readonly VariableSpec[] = [
  {
    descriptors: [
      'SQ *BLUE BOTTLE 0093 SAN FRAN CA',
      'STARBUCKS STORE 04412 SEATTLE WA',
      'PEETS COFFEE #1180',
    ],
    accountId: 'acc_credit',
    min: 425,
    max: 890,
    perMonth: 12,
  },
  {
    descriptors: ['WHOLE FOODS MKT 10241', 'TRADER JOES #182 SAN FRAN CA', 'SAFEWAY #2914'],
    accountId: 'acc_checking',
    min: 3_200,
    max: 14_800,
    perMonth: 7,
  },
  {
    descriptors: ['TST* SWEETGREEN 1042', 'CHIPOTLE 2984 SAN JOSE CA', 'MCDONALDS F1204'],
    accountId: 'acc_credit',
    min: 1_100,
    max: 4_600,
    perMonth: 8,
  },
  {
    descriptors: ['DOORDASH*BURRITO PLACE', 'UBER EATS 8005928', 'GRUBHUB*THAI GARDEN'],
    accountId: 'acc_credit',
    min: 1_800,
    max: 5_400,
    perMonth: 5,
  },
  {
    descriptors: ['SHELL OIL 574812 TX', 'CHEVRON 00204418'],
    accountId: 'acc_credit',
    min: 3_800,
    max: 8_200,
    perMonth: 3,
  },
  {
    descriptors: ['UBER *TRIP HELP.UBER.COM', 'LYFT *RIDE THU 3PM'],
    accountId: 'acc_credit',
    min: 900,
    max: 3_800,
    perMonth: 4,
  },
  {
    descriptors: ['AMZN Mktp US*2K4L9RT21', 'AMAZON.COM*MA9DK2LP0', 'BEST BUY 00014482'],
    accountId: 'acc_credit',
    min: 1_500,
    max: 22_000,
    perMonth: 4,
  },
  {
    // Deliberately unmatched by the lexicon — the "needs review" queue has to be
    // non-empty for the demo to be honest about coverage.
    descriptors: ['HARBOUR LANE BOOKSHOP', 'KOZY KORNER DINER 88', 'VELOCITY BIKE REPAIR'],
    accountId: 'acc_credit',
    min: 1_200,
    max: 9_400,
    perMonth: 3,
  },
];

export interface MockAggregatorOptions {
  /** Anchor date. Generated history ends on this day. */
  today: IsoDate;
  months?: number;
  seed?: number;
}

export class MockAggregator implements AggregatorPort {
  readonly name = 'mock';

  private readonly today: IsoDate;
  private readonly months: number;
  private readonly seed: number;

  constructor(options: MockAggregatorOptions) {
    this.today = options.today;
    this.months = options.months ?? 4;
    this.seed = options.seed ?? 20260807;
  }

  async listAccounts(_linkId: string): Promise<Account[]> {
    return MOCK_ACCOUNTS.map((a) => ({ ...a }));
  }

  async fetchTransactions(
    _linkId: string,
    _cursor?: string,
  ): Promise<{ transactions: RawTransaction[]; nextCursor: string; hasMore: boolean }> {
    // A real adapter returns only what changed since `cursor`. The mock ignores
    // the cursor and returns the full ledger every time on purpose — that is the
    // pathological case for idempotency, and the sync path has to survive it.
    const transactions = this.generate();
    return {
      transactions,
      nextCursor: `mock-cursor-${transactions.length}`,
      hasMore: false,
    };
  }

  private generate(): RawTransaction[] {
    const rand = seededRandom(this.seed);
    const rows: RawTransaction[] = [];

    const anchor = new Date(`${this.today}T00:00:00.000Z`);
    const startYear = anchor.getUTCFullYear();
    const startMonth = anchor.getUTCMonth() - (this.months - 1);

    for (let monthIndex = 0; monthIndex < this.months; monthIndex += 1) {
      const cursorDate = new Date(Date.UTC(startYear, startMonth + monthIndex, 1));
      const year = cursorDate.getUTCFullYear();
      const month = cursorDate.getUTCMonth() + 1;
      const monthDays = daysInMonth(year, month);
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

      for (const [specIndex, spec] of RECURRING.entries()) {
        const day = Math.min(spec.day, monthDays);
        const postedAt = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        if (postedAt > this.today) continue;

        const amount =
          spec.priceChange && monthIndex >= spec.priceChange.fromMonthIndex
            ? spec.priceChange.newAmount
            : spec.amount;

        rows.push({
          // The spec index is part of the id, not the descriptor: two specs can
          // share a descriptor (biweekly payroll) and two descriptors can share
          // a prefix. Provider ids must be unique per account or the sync path
          // silently collapses distinct transactions into one.
          providerTxnId: `rec_${monthIndex}_${specIndex}_${day}`,
          accountId: spec.accountId,
          postedAt,
          amount,
          currency: 'USD',
          descriptor: spec.descriptor,
          pending: false,
        });
      }

      for (const [specIndex, spec] of VARIABLE.entries()) {
        for (let n = 0; n < spec.perMonth; n += 1) {
          const day = 1 + Math.floor(rand() * monthDays);
          const postedAt = `${monthPrefix}-${String(day).padStart(2, '0')}`;
          if (postedAt > this.today) continue;

          const descriptor = spec.descriptors[Math.floor(rand() * spec.descriptors.length)]!;
          const amount = -(spec.min + Math.floor(rand() * (spec.max - spec.min)));

          rows.push({
            // Without specIndex, coffee #0 and restaurants #0 on the same
            // account and day produce the same id and one overwrites the other.
            providerTxnId: `var_${monthIndex}_${specIndex}_${n}_${spec.accountId}_${day}`,
            accountId: spec.accountId,
            postedAt,
            amount,
            currency: 'USD',
            descriptor,
            // The two most recent days are still settling, like a real feed.
            pending: postedAt > addDays(this.today, -2),
          });
        }
      }
    }

    // A late fee, so the health score's payment-history component has a reason
    // to be less than perfect and the demo shows a real remediation action.
    const feeDate = addDays(this.today, -21);
    rows.push({
      providerTxnId: 'fee_late_1',
      accountId: 'acc_credit',
      postedAt: feeDate,
      amount: -3_500,
      currency: 'USD',
      descriptor: 'LATE FEE ASSESSED',
      pending: false,
    });

    return rows.sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  }
}
