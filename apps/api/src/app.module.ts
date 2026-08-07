import { Controller, Get, Module } from '@nestjs/common';

import { CATEGORIES } from './domain/categories';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CoreModule } from './modules/core.module';
import { InsightsModule } from './modules/insights/insights.module';
import { LedgerModule } from './modules/ledger/ledger.module';

@Controller()
class MetaController {
  @Get('healthz')
  health() {
    return { status: 'ok', service: 'finverse-api', time: new Date().toISOString() };
  }

  @Get('categories')
  categories() {
    return { count: CATEGORIES.length, categories: CATEGORIES };
  }
}

@Module({
  imports: [CoreModule, LedgerModule, BudgetsModule, InsightsModule],
  controllers: [MetaController],
})
export class AppModule {}
