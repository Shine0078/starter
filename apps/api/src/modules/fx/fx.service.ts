import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  combineTotals,
  validateRate,
  type CombinedTotal,
  type FxRate,
  type RateSource,
} from '../../domain/fx/rates';
import {
  ACCOUNT_STORE,
  CLOCK,
  FX_RATE_STORE,
  type AccountStore,
  type ClockPort,
  type FxRateStore,
} from '../../ports';

export interface RecordRateInput {
  base: string;
  quote: string;
  rate: number;
  asOf: string;
  source?: RateSource;
  note?: string;
}

export interface CombinedNetWorth extends CombinedTotal {
  asOf: string;
  byCurrency: Array<{ currency: string; amount: number }>;
}

@Injectable()
export class FxService {
  constructor(
    @Inject(FX_RATE_STORE) private readonly rates: FxRateStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  list(userId: string): Promise<FxRate[]> {
    return this.rates.list(userId);
  }

  async record(userId: string, input: RecordRateInput): Promise<FxRate> {
    // Default first, then validate. Validating the raw input would reject an
    // omitted `source` that the service is about to supply itself.
    const source: RateSource = input.source ?? 'manual';

    const check = validateRate({ ...input, source });
    if (!check.ok) {
      throw new BadRequestException({ message: 'Rate rejected.', problems: check.problems });
    }

    if (input.asOf > this.clock.today()) {
      // A future rate would restate today's totals the moment it arrives.
      throw new BadRequestException('A rate cannot be dated in the future.');
    }

    return this.rates.upsert(userId, {
      id: randomUUID(),
      base: input.base.toUpperCase(),
      quote: input.quote.toUpperCase(),
      rate: input.rate,
      asOf: input.asOf,
      source,
      note: input.note?.trim() || null,
      createdAt: this.clock.now().toISOString(),
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.rates.remove(userId, id))) {
      throw new NotFoundException('No such rate.');
    }
  }

  /**
   * Net worth expressed in one currency.
   *
   * Balances are still totalled per currency first — that part never involved a
   * rate and stays exact. Only the final combination uses one, and the response
   * carries every rate relied on plus any currency that had none, so the figure
   * can be judged rather than merely believed.
   */
  async netWorth(userId: string, target: string, asOf?: string): Promise<CombinedNetWorth> {
    if (!/^[A-Za-z]{3}$/.test(target)) {
      throw new BadRequestException('currency must be a three-letter code.');
    }

    const date = asOf ?? this.clock.today();
    const [accounts, rates] = await Promise.all([
      this.accounts.list(userId),
      this.rates.list(userId),
    ]);

    const byCurrency = new Map<string, number>();
    for (const account of accounts) {
      const currency = account.currency.toUpperCase();
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + account.balanceCurrent);
    }

    const totals = [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount }));
    const combined = combineTotals(totals, target, date, rates);

    return { ...combined, asOf: date, byCurrency: totals };
  }
}
