import { Module } from '@nestjs/common';

import { BudgetsModule } from '../budgets/budgets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BudgetsModule, LedgerModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
