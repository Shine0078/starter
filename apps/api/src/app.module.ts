import { Controller, Get, Module } from '@nestjs/common';

import { loadConfig } from './config';
import { CATEGORIES } from './domain/categories';
import { getPool } from './infra/postgres/pool';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CoreModule } from './modules/core.module';
import { InsightsModule } from './modules/insights/insights.module';
import { LedgerModule } from './modules/ledger/ledger.module';

@Controller()
class MetaController {
  /**
   * Liveness *and* readiness. When running on Postgres it actually round-trips
   * a query rather than reporting "ok" because the process is up — a health
   * check that cannot fail tells you nothing, and an API that has lost its
   * database should not be receiving traffic.
   */
  @Get('healthz')
  async health() {
    const config = loadConfig();
    const base = {
      service: 'finverse-api',
      store: config.store,
      time: new Date().toISOString(),
    };

    if (config.store !== 'postgres') {
      return { status: 'ok', ...base };
    }

    try {
      await getPool(config.databaseUrl).query('SELECT 1');
      return { status: 'ok', ...base, database: 'reachable' };
    } catch (error) {
      return {
        status: 'degraded',
        ...base,
        database: 'unreachable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
