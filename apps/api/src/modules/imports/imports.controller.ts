import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../auth/auth.guard';
import {
  ImportsService,
  type CommitInput,
  type PreviewInput,
} from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const batches = await this.imports.list(userId);
    return { count: batches.length, imports: batches };
  }

  /**
   * Classifies the file without writing to the ledger.
   *
   * A POST because the body carries the file, but it has no side effect — the
   * whole feature exists so a user can see the outcome before committing to it.
   */
  @HttpCode(200)
  @Post('preview')
  async preview(@CurrentUser() userId: string, @Body() body: PreviewInput) {
    const result = await this.imports.preview(userId, body);
    if (!result.review) return result;

    return {
      ...result,
      review: {
        ...result.review,
        summary: {
          ...result.review.summary,
          netAmountFormatted: formatMoney(money(result.review.summary.netAmount, 'USD')),
        },
      },
    };
  }

  @Post('commit')
  commit(@CurrentUser() userId: string, @Body() body: CommitInput) {
    return this.imports.commit(userId, body);
  }

  /** Undoes an import, removing only the rows it created. */
  @HttpCode(200)
  @Delete(':id')
  revert(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.imports.revert(userId, id);
  }
}
