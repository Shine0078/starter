import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { categorizeDescriptor } from '../../domain/categorization/categorize';
import { normalizeDescriptor } from '../../domain/categorization/normalize';
import type { RawTransaction, Transaction } from '../../domain/types';
import {
  ACCOUNT_STORE,
  CLOCK,
  NOTIFICATION_STORE,
  RULE_STORE,
  TRANSACTION_STORE,
  type AccountStore,
  type ClockPort,
  type NotificationStore,
  type RuleStore,
  type TransactionStore,
} from '../../ports';
import {
  BANK_LINK_STORE,
  BANK_PROVIDER,
  BANK_TOKEN_CIPHER,
  BANK_WEBHOOK_STORE,
  type BankLink,
  type BankLinkStore,
  type BankProvider,
  type BankTokenCipher,
  type BankWebhookStore,
  type LinkPlatform,
} from '../../ports/banking';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class BankingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankingService.name);
  private webhookTimer?: NodeJS.Timeout;
  private drainingWebhooks = false;

  constructor(
    @Inject(BANK_LINK_STORE) private readonly links: BankLinkStore,
    @Inject(BANK_PROVIDER) private readonly provider: BankProvider,
    @Inject(BANK_TOKEN_CIPHER) private readonly cipher: BankTokenCipher,
    @Inject(BANK_WEBHOOK_STORE) private readonly webhooks: BankWebhookStore,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(RULE_STORE) private readonly rules: RuleStore,
    @Inject(NOTIFICATION_STORE) private readonly notifications: NotificationStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly billing: BillingService,
  ) {}

  onModuleInit(): void {
    this.webhookTimer = setInterval(() => void this.drainWebhookQueue(), 30_000);
    this.webhookTimer.unref();
    void this.drainWebhookQueue();
  }

  onModuleDestroy(): void {
    if (this.webhookTimer) clearInterval(this.webhookTimer);
  }

  list(userId: string): Promise<BankLink[]> {
    return this.links.list(userId);
  }

  async createLinkToken(userId: string, linkId?: string, platform: LinkPlatform = 'android') {
    this.requireConfigured();
    let accessToken: string | undefined;
    if (linkId) {
      const link = await this.links.get(userId, linkId);
      if (!link) throw new NotFoundException('Bank connection not found.');
      accessToken = this.cipher.decrypt(link.encryptedAccessToken);
    }
    return this.provider.createLinkToken(userId, accessToken, platform);
  }

  async exchange(
    userId: string,
    publicToken: string,
    institutionName: string,
    institutionId: string | null,
  ): Promise<BankLink> {
    this.requireConfigured();
    if (!publicToken || publicToken.length > 500) throw new BadRequestException('Invalid public token.');

    // Checked *before* the exchange, deliberately. Exchanging first would
    // create a live Plaid Item that we then refuse to store — an orphan that
    // keeps pulling data we have no record of and no way to revoke.
    const connected = (await this.links.list(userId)).filter((link) => link.status !== 'revoked');
    if ((await this.billing.remainingBankLinks(userId, connected.length)) <= 0) {
      throw new ForbiddenException({
        error: 'plan_upgrade_required',
        message: `Your plan allows ${connected.length} connected institution(s).`,
        entitlement: 'unlimited_bank_links',
        requiredPlan: 'pro',
      });
    }

    const exchanged = await this.provider.exchangePublicToken(publicToken);
    const now = this.clock.now().toISOString();
    const link = await this.links.create(userId, {
      id: randomUUID(),
      provider: 'plaid',
      providerItemId: exchanged.itemId,
      institutionId,
      institutionName: institutionName.trim().slice(0, 160) || 'Connected institution',
      encryptedAccessToken: this.cipher.encrypt(exchanged.accessToken),
      cursor: null,
      status: 'healthy',
      errorCode: null,
      lastSyncedAt: null,
      createdAt: now,
    });
    try {
      await this.sync(userId, link.id);
    } catch {
      // The Item and encrypted token are already durable. Returning the
      // connection lets the client show its recoverable state instead of
      // encouraging a second Link flow and an orphaned Plaid Item.
      this.logger.warn('Initial Plaid synchronization failed; connection retained for retry.');
    }
    return (await this.links.get(userId, link.id))!;
  }

  async sync(userId: string, linkId: string) {
    this.requireConfigured();
    const existing = await this.links.get(userId, linkId);
    if (!existing) throw new NotFoundException('Bank connection not found.');
    const link = await this.links.startSync(userId, linkId);
    if (!link) throw new ConflictException('A synchronization is already in progress.');

    let cursor = link.cursor;
    let inserted = 0;
    let updated = 0;
    let removed = 0;
    let fetched = 0;
    let categorized = 0;
    try {
      const accessToken = this.cipher.decrypt(link.encryptedAccessToken);
      const rules = await this.rules.list(userId);
      const startingCursor = cursor;
      let mutationRetries = 0;
      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        let page: Awaited<ReturnType<BankProvider['sync']>>;
        try {
          page = await this.provider.sync(accessToken, cursor);
        } catch (error) {
          if (
            plaidErrorCode(error) === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' &&
            mutationRetries < 3
          ) {
            // Plaid requires the entire pagination cycle to restart from the
            // cursor used on its first page. Prior upserts are idempotent.
            mutationRetries += 1;
            cursor = startingCursor;
            inserted = 0;
            updated = 0;
            removed = 0;
            fetched = 0;
            categorized = 0;
            pageNumber = -1;
            continue;
          }
          throw error;
        }
        await this.accounts.upsertMany(userId, page.accounts);
        const raw = [...page.added, ...page.modified];
        const mapped = raw.map((row) => this.mapTransaction(row, rules));
        categorized += mapped.filter((row) => row.categorySlug !== 'unknown').length;
        const result = await this.transactions.upsertMany(userId, mapped);
        inserted += result.inserted;
        updated += result.updated;
        removed += await this.transactions.removeByProviderIds(userId, page.removedProviderTxnIds);
        fetched += raw.length;
        cursor = page.nextCursor;
        if (!page.hasMore) break;
        if (pageNumber === 99) throw new Error('Plaid sync exceeded 100 pages.');
      }
      await this.links.update(userId, linkId, {
        cursor,
        status: 'healthy',
        errorCode: null,
        lastSyncedAt: this.clock.now().toISOString(),
      });
      return {
        fetched,
        inserted,
        updated,
        removed,
        coverage: fetched === 0 ? 1 : categorized / fetched,
      };
    } catch (error) {
      const code = plaidErrorCode(error);
      await this.links.update(userId, linkId, {
        status: code === 'ITEM_LOGIN_REQUIRED' ? 'needs_reauth' : 'error',
        errorCode: code,
      });
      try {
        await this.notifySyncFailure(userId, link, code);
      } catch {
        this.logger.warn('Could not persist a bank-sync alert.');
      }
      throw new ServiceUnavailableException({ message: 'Bank synchronization failed.', code });
    }
  }

  async acceptWebhook(rawBody: Buffer, signature: string) {
    this.requireConfigured();
    if (!(await this.provider.verifyWebhook(rawBody, signature))) {
      throw new ForbiddenException('Invalid Plaid webhook signature.');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook JSON.');
    }
    const message = payload as Record<string, unknown>;
    const itemId = typeof message.item_id === 'string' ? message.item_id : null;
    const type = typeof message.webhook_type === 'string' ? message.webhook_type : null;
    const code = typeof message.webhook_code === 'string' ? message.webhook_code : null;

    // Acknowledge every valid Plaid webhook. Only transaction-sync availability
    // creates work; unsupported products must not become a retry storm.
    if (!itemId || type !== 'TRANSACTIONS' || code !== 'SYNC_UPDATES_AVAILABLE') {
      return { accepted: true, queued: false };
    }
    const owner = await this.links.getByProviderItemId(itemId);
    if (!owner) return { accepted: true, queued: false };

    const queued = await this.webhooks.enqueue({
      id: randomUUID(),
      userId: owner.userId,
      linkId: owner.link.id,
      bodyHash: createHash('sha256').update(rawBody).digest('hex'),
      attempts: 0,
      availableAt: this.clock.now().toISOString(),
    });
    if (queued) setImmediate(() => void this.drainWebhookQueue());
    return { accepted: true, queued };
  }

  async disconnect(userId: string, linkId: string): Promise<void> {
    this.requireConfigured();
    const link = await this.links.get(userId, linkId);
    if (!link) throw new NotFoundException('Bank connection not found.');
    try {
      await this.provider.removeItem(this.cipher.decrypt(link.encryptedAccessToken));
    } catch (error) {
      const code = plaidErrorCode(error);
      if (code !== 'ITEM_NOT_FOUND') {
        throw new ServiceUnavailableException({ message: 'Could not revoke bank access.', code });
      }
    }
    await this.webhooks.purgeLink(userId, linkId);
    await this.links.remove(userId, linkId);
  }

  async drainWebhookQueue(): Promise<void> {
    if (this.drainingWebhooks || !this.provider.configured) return;
    this.drainingWebhooks = true;
    try {
      const jobs = await this.webhooks.claim(10);
      for (const job of jobs) {
        try {
          await this.sync(job.userId, job.linkId);
          await this.webhooks.complete(job.userId, job.id);
        } catch {
          const terminal = job.attempts >= 5;
          const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, job.attempts - 1));
          const availableAt = new Date(this.clock.now().getTime() + delayMs).toISOString();
          await this.webhooks.retry(job.userId, job.id, availableAt, terminal);
          this.logger.warn(`Plaid webhook sync ${terminal ? 'failed' : 'will retry'} (attempt ${job.attempts}).`);
        }
      }
      if (jobs.length === 10) setImmediate(() => void this.drainWebhookQueue());
    } finally {
      this.drainingWebhooks = false;
    }
  }

  private mapTransaction(raw: RawTransaction, rules: Awaited<ReturnType<RuleStore['list']>>): Transaction {
    const category = categorizeDescriptor(raw.descriptor, { rules });
    return {
      id: `txn_${raw.accountId}_${raw.providerTxnId}`,
      accountId: raw.accountId,
      providerTxnId: raw.providerTxnId,
      postedAt: raw.postedAt,
      amount: raw.amount,
      currency: raw.currency,
      rawDescriptor: raw.descriptor,
      normalizedDescriptor: normalizeDescriptor(raw.descriptor),
      merchant: category.merchant,
      categorySlug: category.categorySlug,
      categorySource: category.source,
      categoryConfidence: category.confidence,
      isRecurring: false,
      pending: raw.pending,
    };
  }

  private async notifySyncFailure(userId: string, link: BankLink, code: string): Promise<void> {
    const preferences = await this.notifications.getPreferences(userId);
    if (!preferences.bankSync) return;
    const reauth = code === 'ITEM_LOGIN_REQUIRED';
    const today = this.clock.today();
    await this.notifications.upsert(userId, {
      id: randomUUID(),
      kind: 'bank_sync',
      title: reauth ? 'Reconnect your bank' : 'Bank sync needs attention',
      message: reauth
        ? `${link.institutionName} needs you to sign in again before transactions can update.`
        : `${link.institutionName} could not update. FINVERSE will retry automatically.`,
      severity: reauth ? 'critical' : 'warning',
      dedupeKey: `bank-sync:${link.id}:${today}:${code}`,
      readAt: null,
      createdAt: this.clock.now().toISOString(),
    });
  }

  private requireConfigured(): void {
    if (!this.provider.configured) {
      throw new ServiceUnavailableException('Plaid is not configured on this server.');
    }
  }
}

function plaidErrorCode(error: unknown): string {
  const response = (error as { response?: { data?: { error_code?: unknown } } }).response;
  const code = response?.data?.error_code;
  return typeof code === 'string' ? code : 'PROVIDER_ERROR';
}
