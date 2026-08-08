import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { toPublicUser } from '../../domain/auth/types';
import {
  ACCOUNT_STORE,
  BUDGET_STORE,
  GOAL_STORE,
  NOTIFICATION_STORE,
  RULE_STORE,
  TRANSACTION_STORE,
  type AccountStore,
  type BudgetStore,
  type GoalStore,
  type NotificationStore,
  type RuleStore,
  type TransactionStore,
} from '../../ports';
import {
  AUTH_EVENT_STORE,
  PASSWORD_HASHER,
  SESSION_STORE,
  USER_STORE,
  type AuthEventStore,
  type PasswordHasher,
  type SessionStore,
  type UserStore,
} from '../../ports/auth';
import { BANK_LINK_STORE, type BankLinkStore } from '../../ports/banking';
import {
  CONSENT_STORE,
  type ConsentEvent,
  type ConsentKind,
  type ConsentStore,
} from '../../ports/privacy';
import type { RequestContext } from '../auth/auth.service';

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUTH_EVENT_STORE) private readonly authEvents: AuthEventStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(BUDGET_STORE) private readonly budgets: BudgetStore,
    @Inject(RULE_STORE) private readonly rules: RuleStore,
    @Inject(GOAL_STORE) private readonly goals: GoalStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(BANK_LINK_STORE) private readonly bankLinks: BankLinkStore,
    @Inject(CONSENT_STORE) private readonly consents: ConsentStore,
  ) {}

  async dashboard(userId: string) {
    const [user, consentEvents, activity] = await Promise.all([
      this.users.findById(userId),
      this.consents.list(userId),
      this.authEvents.listForUser(userId, 100),
    ]);
    if (!user) throw new NotFoundException('Account not found.');

    const latest = new Map<ConsentKind, ConsentEvent>();
    for (const event of consentEvents) {
      if (!latest.has(event.kind)) latest.set(event.kind, event);
    }
    const present = (kind: ConsentKind) => {
      const event = latest.get(kind);
      return {
        granted: event?.granted ?? false,
        policyVersion: event?.policyVersion ?? 'preference-v1',
        updatedAt: event?.createdAt.toISOString() ?? null,
      };
    };

    return {
      user: toPublicUser(user),
      optionalConsents: {
        analytics: present('analytics'),
        productUpdates: present('product_updates'),
      },
      consentHistory: consentEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        granted: event.granted,
        policyVersion: event.policyVersion,
        source: event.source,
        createdAt: event.createdAt.toISOString(),
      })),
      securityActivity: activity.map((event) => ({
        id: event.id,
        kind: event.kind,
        succeeded: event.succeeded,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      })),
      retention: {
        accountDeletionRecoveryDays: 30,
        offlineCacheMaximumDays: 30,
      },
    };
  }

  async updateOptionalConsent(userId: string, kind: string, granted: boolean) {
    if (kind !== 'analytics' && kind !== 'product_updates') {
      throw new BadRequestException('Only optional analytics and product update choices can be changed.');
    }
    await this.consents.record(userId, {
      id: randomUUID(),
      userId,
      kind,
      granted,
      policyVersion: 'preference-v1',
      source: 'user_settings',
      createdAt: new Date(),
    });
    return this.dashboard(userId);
  }

  async exportData(userId: string, currentSessionId: string, password: string, context: RequestContext) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Account not found.');
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    await this.authEvents.record({
      id: randomUUID(),
      userId,
      emailAttempted: user.email,
      kind: 'data_exported',
      succeeded: true,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      detail: 'Portable account export generated',
      createdAt: new Date(),
    });

    const [
      sessions,
      authEvents,
      accounts,
      transactions,
      budgets,
      rules,
      goals,
      notifications,
      notificationPreferences,
      bankLinks,
      consentEvents,
    ] = await Promise.all([
      this.sessions.listActive(userId),
      this.authEvents.listForUser(userId, 10_000),
      this.accounts.list(userId),
      this.transactions.list(userId),
      this.budgets.list(userId),
      this.rules.list(userId),
      this.goals.list(userId),
      this.notifications.list(userId),
      this.notifications.getPreferences(userId),
      this.bankLinks.list(userId),
      this.consents.list(userId),
    ]);

    const goalsWithContributions = await Promise.all(
      goals.map(async (goal) => ({
        ...goal,
        contributions: await this.goals.listContributions(userId, goal.id),
      })),
    );

    return {
      format: 'finverse-portable-export',
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      user: toPublicUser(user),
      sessions: sessions.map((session) => ({
        id: session.id,
        issuedAt: session.issuedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        current: session.id === currentSessionId,
      })),
      securityActivity: authEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        succeeded: event.succeeded,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      })),
      accounts,
      transactions,
      budgets,
      categorizationRules: rules,
      goals: goalsWithContributions,
      notifications,
      notificationPreferences,
      consentHistory: consentEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      bankConnections: bankLinks.map((link) => ({
        id: link.id,
        provider: link.provider,
        institutionId: link.institutionId,
        institutionName: link.institutionName,
        status: link.status,
        errorCode: link.errorCode,
        lastSyncedAt: link.lastSyncedAt,
        createdAt: link.createdAt,
      })),
    };
  }
}
