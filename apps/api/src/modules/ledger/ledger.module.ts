import { Module } from '@nestjs/common';

import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
  controllers: [LedgerController, SavedViewsController],
  providers: [LedgerService, SavedViewsService],
  exports: [LedgerService, SavedViewsService],
})
export class LedgerModule {}
