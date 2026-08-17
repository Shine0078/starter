import { Module } from '@nestjs/common';

import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { RuleApplyController } from './rule-apply.controller';
import { RuleApplyService } from './rule-apply.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';
import { ViewReportService } from './view-report.service';

@Module({
  controllers: [LedgerController, SavedViewsController, RuleApplyController],
  providers: [LedgerService, SavedViewsService, RuleApplyService, ViewReportService],
  exports: [LedgerService, SavedViewsService, RuleApplyService, ViewReportService],
})
export class LedgerModule {}
