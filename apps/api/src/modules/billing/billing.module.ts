import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementGuard } from './entitlement.guard';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [AuthModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, EntitlementGuard],
  // Exported so other modules can gate their own routes with
  // @RequiresEntitlement and check link limits before connecting a bank.
  exports: [BillingService, EntitlementGuard],
})
export class BillingModule {}
