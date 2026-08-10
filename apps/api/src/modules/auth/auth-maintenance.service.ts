import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../ports';
import {
  ACCOUNT_DELETION_STORE,
  SESSION_STORE,
  type AccountDeletionStore,
  type SessionStore,
} from '../../ports/auth';

/**
 * Housekeeping that must not depend on a person remembering to run a command.
 *
 * The work is deliberately idempotent: every instance may run it, and the
 * Postgres stores make each delete safe when two instances wake up together.
 * Tests do not start the timer, while the one-shot CLI remains available for
 * deployments that prefer a dedicated worker.
 */
@Injectable()
export class AuthMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private static readonly INTERVAL_MS = 60 * 60_000;
  private readonly logger = new Logger(AuthMaintenanceService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ACCOUNT_DELETION_STORE) private readonly deletions: AccountDeletionStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  onModuleInit(): void {
    // A test application can be created and destroyed many times in one
    // process. Avoid hidden timers there; production and development still
    // get an immediate pass followed by hourly maintenance.
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;

    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), AuthMaintenanceService.INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for the CLI/tests and intentionally safe to call concurrently. */
  async runOnce(): Promise<{ purgedAccounts: number; expiredSessions: number }> {
    if (this.running) return { purgedAccounts: 0, expiredSessions: 0 };
    this.running = true;
    try {
      const now = this.clock.now();
      let purgedAccounts = 0;
      let expiredSessions = 0;

      // Keep the two operations independent. A transient deletion-store
      // failure must not prevent session cleanup, and vice versa.
      try {
        purgedAccounts = await this.deletions.purgeDue(now);
      } catch (error) {
        this.logger.warn(`Account-deletion maintenance failed: ${safeError(error)}`);
      }
      try {
        expiredSessions = await this.sessions.deleteExpired(now);
      } catch (error) {
        this.logger.warn(`Session maintenance failed: ${safeError(error)}`);
      }

      if (purgedAccounts > 0 || expiredSessions > 0) {
        this.logger.log(
          `Auth maintenance removed ${purgedAccounts} account(s) and ${expiredSessions} expired session(s).`,
        );
      }
      return { purgedAccounts, expiredSessions };
    } finally {
      this.running = false;
    }
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
