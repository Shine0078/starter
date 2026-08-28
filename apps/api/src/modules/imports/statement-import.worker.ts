import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { loadConfig } from '../../config';
import {
  STATEMENT_IMPORT_STORE,
  type StatementImportStore,
} from '../../ports';
import { StatementImportService } from './statement-import.service';

/**
 * Durable statement analysis worker.
 *
 * Every instance may run this loop. PostgreSQL claim uses SKIP LOCKED and a
 * stale lease, so a crashed instance leaves work for another instance without
 * requiring process-local state or a privileged database connection.
 */
@Injectable()
export class StatementImportWorker implements OnModuleInit, OnModuleDestroy {
  private static readonly INTERVAL_MS = 10_000;
  private readonly logger = new Logger(StatementImportWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(STATEMENT_IMPORT_STORE) private readonly imports: StatementImportStore,
    private readonly service: StatementImportService,
  ) {}

  onModuleInit(): void {
    if (!loadConfig().statementImportAsync || process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), StatementImportWorker.INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for integration tests and dedicated worker invocations. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const jobs = await this.imports.claim(25);
      for (const job of jobs) {
        try {
          await this.service.processQueued(job);
        } catch (error) {
          // processQueued is defensive and records parser failures itself. A
          // store or infrastructure failure is logged without source content;
          // the lease will expire and another worker can retry it.
          this.logger.warn(`Statement job ${job.id} was not completed: ${safeError(error)}`);
        }
      }
      if (jobs.length === 25) setImmediate(() => void this.runOnce());
      return jobs.length;
    } catch (error) {
      this.logger.warn(`Statement queue claim failed: ${safeError(error)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'unknown error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240);
}
