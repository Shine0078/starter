import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../ports';
import {
  PUSH_PROVIDER,
  PUSH_TOKEN_STORE,
  type PushPlatform,
  type PushProvider,
  type PushTokenStore,
} from '../../ports/push';

@Injectable()
export class PushService {
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
}
