import { Module } from '@nestjs/common';

import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { PlaidWebhookController } from './plaid-webhook.controller';

@Module({
  controllers: [BankingController, PlaidWebhookController],
  providers: [BankingService],
  exports: [BankingService],
})
export class BankingModule {}
