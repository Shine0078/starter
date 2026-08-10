import {
  Controller,
  Get,
  Header,
  Module,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';

import { loadConfig } from './config';
import { CATEGORIES } from './domain/categories';
import { PostgresThrottlerStorage } from './infra/http/postgres-throttler-storage';
import { getAppPool } from './infra/postgres/pool';
import { AuthGuard, Public } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { BankingModule } from './modules/banking/banking.module';
import { BillingModule } from './modules/billing/billing.module';
import { CoreModule } from './modules/core.module';
import { InsightsModule } from './modules/insights/insights.module';
import { GoalsModule } from './modules/goals/goals.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { httpMetrics, metricsTokenMatches } from './infra/http/metrics';
import { appleAppSiteAssociation as buildAppleAppSiteAssociation } from './infra/http/apple-app-site-association';

const appConfig = loadConfig();

@Controller()
class MetaController {
  /**
   * Liveness *and* readiness. When running on Postgres it actually round-trips
   * a query rather than reporting "ok" because the process is up — a health
   * check that cannot fail tells you nothing, and an API that has lost its
   * database should not be receiving traffic.
   *
   * Public: a load balancer has no credentials, and the response deliberately
   * carries no user data.
   */
  @Public()
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
      // The runtime pool, not the owner's. Readiness is about the connection
      // that actually serves requests — the owner's could be fine while the
      // application role's password is stale and every request fails.
      await getAppPool(config.appDatabaseUrl).query('SELECT 1');
      return { status: 'ok', ...base, database: 'reachable' };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        ...base,
        database: 'unreachable',
        // In production the message could name the host or credentials, so it
        // is withheld; locally it is the fastest way to see what is wrong.
        ...(config.isProduction
          ? {}
          : { error: error instanceof Error ? error.message : String(error) }),
      });
    }
  }

  /** Public: a static reference list with nothing user-specific in it. */
  @Public()
  @Get('categories')
  categories() {
    return { count: CATEGORIES.length, categories: CATEGORIES };
  }

  /** Public so a client can show the exact documents before account creation. */
  @Public()
  @Get('legal')
  legal() {
    const { legal } = loadConfig();
    return legal;
  }

  /**
   * Internal Prometheus scrape endpoint. It is public to the application guard
   * because a monitoring agent has no user session; production must configure
   * METRICS_TOKEN so the endpoint is not an unauthenticated data source.
   */
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('metrics')
  metrics(@Req() request: Request) {
    const config = loadConfig();
    if (config.isProduction && !config.metricsToken) {
      throw new ServiceUnavailableException('Metrics access is not configured.');
    }
    if (config.metricsToken && !metricsTokenMatches(request.header('authorization'), config.metricsToken)) {
      throw new UnauthorizedException('Metrics token required.');
    }
    return httpMetrics.toPrometheus();
  }

  /** Public Apple Universal Link registration for native Plaid OAuth. */
  @Public()
  @Header('Content-Type', 'application/json')
  @Get('.well-known/apple-app-site-association')
  appleAppSiteAssociation() {
    const config = loadConfig().iosUniversalLink;
    if (!config) {
      throw new ServiceUnavailableException('iOS Universal Links are not configured.');
    }
    return buildAppleAppSiteAssociation(config);
  }

  /** Apple also probes this legacy path, so keep both forms equivalent. */
  @Public()
  @Header('Content-Type', 'application/json')
  @Get('apple-app-site-association')
  appleAppSiteAssociationFallback() {
    return this.appleAppSiteAssociation();
  }
}

@Module({
  imports: [
    CoreModule,
    // Coarse per-IP limit in front of everything. The auth routes tighten it
    // further; account lockout is separate and counts per-account, because
    // per-IP alone is bypassed with a proxy pool.
    ThrottlerModule.forRoot({
      storage:
        appConfig.store === 'postgres'
          ? new PostgresThrottlerStorage(getAppPool(appConfig.appDatabaseUrl))
          : undefined,
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Test suites drive hundreds of requests from one address and would
      // otherwise fail on 429 for reasons unrelated to what they assert.
      // Throttling itself is covered by test/auth-throttle.spec.ts, which
      // leaves this unset. Never set it outside a test run.
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    AuthModule,
    BankingModule,
    BillingModule,
    LedgerModule,
    BudgetsModule,
    GoalsModule,
    NotificationsModule,
    InsightsModule,
    PrivacyModule,
  ],
  controllers: [MetaController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registered globally so routes are authenticated by default. Anything
    // genuinely public must say so with @Public(). The reverse arrangement
    // fails open: forget a decorator and data leaks with nothing looking wrong.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
