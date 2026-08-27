import { Module } from '@nestjs/common';

import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { StatementImportController } from './statement-import.controller';
import { StatementImportService } from './statement-import.service';

@Module({
  controllers: [ImportsController, StatementImportController],
  providers: [ImportsService, StatementImportService],
  exports: [ImportsService, StatementImportService],
})
export class ImportsModule {}
