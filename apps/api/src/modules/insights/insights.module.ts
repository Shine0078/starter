import { Module } from '@nestjs/common';

import { BudgetsModule } from '../budgets/budgets.module';
import { BillingModule } from '../billing/billing.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [BudgetsModule, BillingModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
