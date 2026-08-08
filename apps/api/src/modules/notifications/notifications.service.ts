import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { NotificationPreferences, UserNotification } from '../../domain/types';
import {
  deriveSubscriptionAlerts,
  deriveUnusualTransactionAlerts,
  type DerivedFinancialAlert,
} from '../../domain/notifications/financial-alerts';
import {
  CLOCK,
  NOTIFICATION_STORE,
  type ClockPort,
  type NotificationStore,
} from '../../ports';
import { BudgetsService } from '../budgets/budgets.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly budgets: BudgetsService,
    private readonly ledger: LedgerService,
  ) {}

  async list(userId: string): Promise<UserNotification[]> {
    await this.refreshDerived(userId);
    return this.notifications.list(userId);
  }

  preferences(userId: string): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(userId);
  }

  async updatePreferences(
    userId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.notifications.getPreferences(userId);
    const next = { ...current };
    for (const key of Object.keys(current) as Array<keyof NotificationPreferences>) {
      if (patch[key] !== undefined && typeof patch[key] === 'boolean') next[key] = patch[key]!;
    }
    return this.notifications.updatePreferences(userId, next);
  }

  async markRead(userId: string, id: string): Promise<void> {
    if (!(await this.notifications.markRead(userId, id, this.clock.now().toISOString()))) {
      throw new NotFoundException('Notification not found.');
    }
  }

  private async refreshDerived(userId: string): Promise<void> {
    const preferences = await this.notifications.getPreferences(userId);
    const today = this.clock.today();
    const createdAt = this.clock.now().toISOString();

    if (
      preferences.bills ||
      preferences.subscriptions ||
      preferences.unusualTransactions
    ) {
      const transactions = await this.ledger.listTransactions(userId, {});
      const derived = [
        ...deriveSubscriptionAlerts(transactions, today),
        ...deriveUnusualTransactionAlerts(transactions, today),
      ];
      for (const alert of derived) {
        if (!alertEnabled(alert, preferences)) continue;
        await this.notifications.upsert(userId, {
          ...alert,
          id: randomUUID(),
          readAt: null,
          createdAt,
        });
      }
    }

    if (preferences.budget) {
      for (const progress of await this.budgets.progress(userId, today)) {
        for (const alert of progress.alerts) {
          await this.notifications.upsert(userId, {
            id: randomUUID(),
            kind: 'budget',
            title: `${progress.categorySlug.replaceAll('_', ' ')} budget`,
            message: alert.message,
            severity: alert.severity,
            dedupeKey: `budget:${progress.budgetId}:${progress.period.start}:${alert.threshold}`,
            readAt: null,
            createdAt,
          });
        }
      }
    }

    const accounts = await this.ledger.listAccounts(userId);
    if (preferences.creditUtilization) {
      for (const account of accounts) {
        if (account.type !== 'credit_card' || !account.creditLimit) continue;
        const utilization = Math.max(0, -account.balanceCurrent) / account.creditLimit;
        if (utilization < 0.3) continue;
        await this.notifications.upsert(userId, {
          id: randomUUID(),
          kind: 'credit_utilization',
          title: 'Credit utilization alert',
          message: `${account.name} is at ${Math.round(utilization * 100)}% utilization. Consider paying before the statement closes.`,
          severity: utilization >= 0.8 ? 'critical' : 'warning',
          dedupeKey: `credit:${account.id}:${today.slice(0, 7)}:${utilization >= 0.8 ? 80 : 30}`,
          readAt: null,
          createdAt,
        });
      }
    }

    if (preferences.lowBalance) {
      for (const account of accounts) {
        if (!['checking', 'savings'].includes(account.type) || account.balanceCurrent >= 20_000) {
          continue;
        }
        await this.notifications.upsert(userId, {
          id: randomUUID(),
          kind: 'low_balance',
          title: 'Low balance',
          message: `${account.name} has fallen below the configured $200.00 early-warning threshold.`,
          severity: account.balanceCurrent < 0 ? 'critical' : 'warning',
          dedupeKey: `low-balance:${account.id}:${today.slice(0, 7)}`,
          readAt: null,
          createdAt,
        });
      }
    }
  }
}

function alertEnabled(
  alert: DerivedFinancialAlert,
  preferences: NotificationPreferences,
): boolean {
  switch (alert.kind) {
    case 'bill':
      return preferences.bills;
    case 'subscription':
      return preferences.subscriptions;
    case 'unusual_transaction':
      return preferences.unusualTransactions;
    default:
      return false;
  }
}
