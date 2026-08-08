import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { BILLING_PROVIDER, type BillingProvider } from '../../ports/billing';
import { Public } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing-webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger('StripeWebhook');

  constructor(
    private readonly billing: BillingService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  /**
   * Public because the provider has no FINVERSE credentials. The signature over
   * the exact raw bytes is the authentication, which is why `rawBody` is
   * enabled in main.ts — re-serialising the parsed JSON changes the bytes and
   * every signature check would fail.
   *
   * Returns 200 for anything successfully verified, including events we ignore
   * or have already applied. A non-2xx tells the provider to redeliver, so
   * responding with an error to an event we simply do not care about would
   * generate an endless retry loop.
   */
  @Public()
  @Throttle({ default: { limit: 1_000, ttl: 60_000 } })
  @HttpCode(200)
  @Post('stripe')
  async stripe(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Signed raw webhook body is required.');
    }
    if (!this.provider.configured) {
      throw new BadRequestException('Billing is not configured on this deployment.');
    }

    let event;
    try {
      event = this.provider.parseWebhook(request.rawBody, signature);
    } catch {
      // Deliberately terse: a verification failure is either a misconfigured
      // secret or someone probing the endpoint, and neither deserves detail.
      throw new BadRequestException('Invalid webhook signature.');
    }

    const outcome = await this.billing.applyEvent(event);
    this.logger.log(`Billing event ${event.id} (${event.type}): ${outcome}`);
    return { received: true, outcome };
  }
}
