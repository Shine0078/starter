import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../ports';
import {
  PUSH_PROVIDER,
  PUSH_TOKEN_STORE,
  PushTokenNoLongerValidError,
  type PushMessage,
  type PushPlatform,
  type PushProvider,
  type PushTokenStore,
} from '../../ports/push';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(PUSH_TOKEN_STORE) private readonly tokens: PushTokenStore,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  get configured(): boolean {
    return this.provider.configured;
  }

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.tokens.register(userId, token, platform, this.clock.now().toISOString());
  }

  async unregister(userId: string, token: string): Promise<boolean> {
    return this.tokens.unregister(userId, token);
  }

  /**
   * Best-effort remote delivery. Financial alert persistence is the source of
   * truth, so a push-provider outage must never make an API action fail or
   * prevent the in-app notification centre from showing the alert later.
   */
  async deliver(userId: string, message: PushMessage): Promise<{
    attempted: number;
    delivered: number;
    removed: number;
    failed: number;
  }> {
    if (!this.provider.configured) {
      return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
    }

    const targets = await this.tokens.list(userId);
    let delivered = 0;
    let removed = 0;
    let failed = 0;
    await Promise.all(targets.map(async ({ token }) => {
      try {
        await this.provider.send(token, message);
        delivered += 1;
      } catch (error) {
        if (error instanceof PushTokenNoLongerValidError) {
          if (await this.tokens.unregister(userId, token)) removed += 1;
          return;
        }
        // Do not log provider objects: some SDKs include request config,
        // bearer credentials, or the opaque device token in their errors.
        failed += 1;
      }
    }));

    if (failed > 0) {
      this.logger.warn(`Remote push delivery failed for ${failed} target(s).`);
    }
    return { attempted: targets.length, delivered, removed, failed };
  }
}
