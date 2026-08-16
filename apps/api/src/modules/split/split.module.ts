import { Module } from '@nestjs/common';

import { SplitController } from './split.controller';
import { SplitService } from './split.service';

@Module({ controllers: [SplitController], providers: [SplitService], exports: [SplitService] })
export class SplitModule {}
