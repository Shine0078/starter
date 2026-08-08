import { Module } from '@nestjs/common';

import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { PlaidWebhookController } from './plaid-webhook.controller';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [BankingController, PlaidWebhookController],
  providers: [BankingService],
  exports: [BankingService],
})
export class BankingModule {}
