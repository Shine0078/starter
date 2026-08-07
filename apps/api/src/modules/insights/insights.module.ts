import { Module } from '@nestjs/common';

import { BudgetsModule } from '../budgets/budgets.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [BudgetsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
