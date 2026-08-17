import { Module } from '@nestjs/common';

import { ScheduledController } from './scheduled.controller';
import { ScheduledService } from './scheduled.service';

@Module({
  controllers: [ScheduledController],
  providers: [ScheduledService],
  exports: [ScheduledService],
})
export class ScheduledModule {}
