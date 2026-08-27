import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../auth/auth.guard';
import { StatementImportService } from './statement-import.service';

@Controller('imports/statements')
export class StatementImportController {
  constructor(private readonly statements: StatementImportService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() userId: string, @Body() body: Record<string, unknown>) {
    return this.statements.create(userId, body);
  }

  @Post('preview')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(201)
  preview(@CurrentUser() userId: string, @Body() body: Record<string, unknown>) {
    return this.statements.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string) { return this.statements.list(userId); }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) { return this.statements.get(userId, id); }

  @Patch(':id/rows/:rowId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  editRow(@CurrentUser() userId: string, @Param('id') id: string, @Param('rowId') rowId: string, @Body() body: Record<string, unknown>) {
    return this.statements.editRow(userId, id, rowId, body);
  }

  @Post(':id/rows/:rowId/split')
  split(@CurrentUser() userId: string, @Param('id') id: string, @Param('rowId') rowId: string, @Body() body: { parts?: unknown }) {
    return this.statements.splitRow(userId, id, rowId, body);
  }

  @Post(':id/rows/merge')
  merge(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: { rowIds?: unknown }) {
    return this.statements.mergeRows(userId, id, body);
  }

  @Post(':id/approve')
  approve(@CurrentUser() userId: string, @Param('id') id: string) { return this.statements.approve(userId, id); }

  @Delete(':id/source')
  @HttpCode(204)
  async deleteSource(@CurrentUser() userId: string, @Param('id') id: string) { await this.statements.deleteSource(userId, id); }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() userId: string, @Param('id') id: string) { await this.statements.delete(userId, id); }

  @Get(':id/audit')
  audit(@CurrentUser() userId: string, @Param('id') id: string) { return this.statements.audit(userId, id); }

  @Get(':id/summary')
  summary(@CurrentUser() userId: string, @Param('id') id: string) { return this.statements.summary(userId, id); }
}
