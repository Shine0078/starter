import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PLANS, PURCHASABLE_PLANS } from '../../domain/billing/plans';
import { CurrentUser } from '../auth/auth.guard';
import { Public } from '../auth/auth.guard';
import { CreateCheckoutSessionDto } from './billing.dto';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /**
   * The catalogue. Public so a client can show pricing before sign-up, and it
   * carries no user data — only the tiers and what each includes.
   */
  @Public()
  @Get('plans')
  plans() {
    return {
      plans: Object.values(PLANS).map((plan) => ({
        ...plan,
        purchasable: PURCHASABLE_PLANS.includes(plan.id),
      })),
    };
  }

  @Get('subscription')
  subscription(@CurrentUser() userId: string) {
    return this.billing.summary(userId);
  }

  /**
   * Starts a hosted checkout and returns the URL to open.
   *
   * Throttled hard: each call creates a customer record at the provider, and an
   * unthrottled endpoint is a way to fill someone's Stripe account with junk.
   */
  @Post('checkout-session')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(@CurrentUser() userId: string, @Body() body: CreateCheckoutSessionDto) {
    return this.billing.createCheckoutSession(userId, body.plan);
  }

  /** A link to the provider's management page: cancel, change card, invoices. */
  @Post('portal-session')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  portal(@CurrentUser() userId: string) {
    return this.billing.createPortalSession(userId);
  }
}
