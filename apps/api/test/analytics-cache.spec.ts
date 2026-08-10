import { describe, expect, it } from 'vitest';

import type { AccountStore, TransactionStore } from '../src/ports';
import type { BankLinkStore } from '../src/ports/banking';
import { FixedClock } from '../src/infra/clock';
import { FinanceEventBus } from '../src/infra/events/finance-event-bus';
import { InsightsService } from '../src/modules/insights/insights.service';
import { BudgetsService } from '../src/modules/budgets/budgets.service';

describe('analytics cache', () => {
  it('reuses a short-lived report and invalidates it on finance events', async () => {
    let reads = 0;
    const transactions = {
      list: async () => {
        reads += 1;
        return [
          {
            id: 'txn-1',
            accountId: 'acct-1',
            providerTxnId: 'provider-1',
            postedAt: '2026-08-08',
            amount: -1_250,
            currency: 'USD',
            rawDescriptor: 'BLUE BOTTLE COFFEE',
            normalizedDescriptor: 'blue bottle coffee',
            merchant: 'Blue Bottle Coffee',
            categorySlug: 'coffee',
            categorySource: 'lexicon' as const,
            categoryConfidence: 0.99,
            isRecurring: false,
            pending: false,
          },
        ];
      },
    } as unknown as TransactionStore;
    const events = new FinanceEventBus();
    const service = new InsightsService(
      transactions,
      {} as AccountStore,
      {} as BankLinkStore,
      new FixedClock('2026-08-08'),
      {} as BudgetsService,
      events,
    );

    const first = await service.analytics('user-1');
    const second = await service.analytics('user-1');
    expect(second).toBe(first);
    expect(reads).toBe(1);

    events.publish({
      type: 'TransactionCategorized',
      userId: 'user-1',
      at: '2026-08-08T12:00:00.000Z',
    });
    const afterChange = await service.analytics('user-1');
    expect(afterChange).not.toBe(first);
    expect(reads).toBe(2);
  });

  it('does not invalidate another user\'s report', async () => {
    let reads = 0;
    const transactions = {
      list: async () => {
        reads += 1;
        return [];
      },
    } as unknown as TransactionStore;
    const events = new FinanceEventBus();
    const service = new InsightsService(
      transactions,
      {} as AccountStore,
      {} as BankLinkStore,
      new FixedClock('2026-08-08'),
      {} as BudgetsService,
      events,
    );

    await service.analytics('user-1');
    await service.analytics('user-2');
    events.publish({
      type: 'BankSyncCompleted',
      userId: 'user-1',
      at: '2026-08-08T12:00:00.000Z',
    });
    await service.analytics('user-2');

    expect(reads).toBe(2);
  });
});
