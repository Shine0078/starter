import { describe, expect, it } from 'vitest';

import { FinanceEventBus } from '../src/infra/events/finance-event-bus';

describe('FinanceEventBus', () => {
  it('delivers events and supports safe unsubscribe', () => {
    const bus = new FinanceEventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((event) => {
      seen.push(event.type);
    });

    bus.publish({
      type: 'TransactionImported',
      userId: 'user-1',
      at: '2026-08-08T12:00:00.000Z',
    });
    unsubscribe();
    bus.publish({
      type: 'BankSyncCompleted',
      userId: 'user-1',
      at: '2026-08-08T12:01:00.000Z',
    });

    expect(seen).toEqual(['TransactionImported']);
  });

  it('isolates a failing consumer from other consumers', async () => {
    const bus = new FinanceEventBus();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error('consumer failed');
    });
    bus.subscribe((event) => {
      seen.push(event.type);
    });

    bus.publish({
      type: 'AccountUpdated',
      userId: 'user-1',
      at: '2026-08-08T12:00:00.000Z',
    });
    await Promise.resolve();

    expect(seen).toEqual(['AccountUpdated']);
  });
});
