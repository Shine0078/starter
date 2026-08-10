import { Injectable, Logger } from '@nestjs/common';

/**
 * Internal domain events for the modular monolith.
 *
 * This is deliberately an in-process bus rather than a queue or a second
 * service. PostgreSQL remains authoritative; events are notifications for
 * derived work such as cache invalidation and alert evaluation. A later
 * deployment can replace this adapter without changing the services that
 * publish events.
 */
export type FinanceEventType =
  | 'TransactionImported'
  | 'TransactionUpdated'
  | 'TransactionCategorized'
  | 'BankSyncCompleted'
  | 'AccountConnected'
  | 'AccountUpdated'
  | 'AccountDisconnected';

export interface FinanceEvent {
  type: FinanceEventType;
  userId: string;
  at: string;
  linkId?: string;
  transactionIds?: readonly string[];
  inserted?: number;
  updated?: number;
  removed?: number;
  fetched?: number;
}

export type FinanceEventHandler = (event: FinanceEvent) => void | Promise<void>;

@Injectable()
export class FinanceEventBus {
  private readonly logger = new Logger(FinanceEventBus.name);
  private readonly handlers = new Set<FinanceEventHandler>();

  subscribe(handler: FinanceEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(event: FinanceEvent): void {
    // Snapshot the set so a handler can unsubscribe itself safely while an
    // event is being delivered.
    for (const handler of [...this.handlers]) {
      try {
        // Promise.resolve also handles synchronous handlers uniformly. A
        // consumer failure must not fail the financial write that emitted it.
        void Promise.resolve(handler(event)).catch((error: unknown) => {
          this.logger.warn(
            `Finance event consumer failed for ${event.type}: ${safeError(error)}`,
          );
        });
      } catch (error) {
        this.logger.warn(
          `Finance event consumer failed for ${event.type}: ${safeError(error)}`,
        );
      }
    }
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
