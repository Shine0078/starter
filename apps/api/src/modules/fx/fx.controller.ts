import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../auth/auth.guard';
import { FxService, type RecordRateInput } from './fx.service';

@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rates')
  async list(@CurrentUser() userId: string) {
    const rates = await this.fx.list(userId);
    return { count: rates.length, rates };
  }

  @Post('rates')
  record(@CurrentUser() userId: string, @Body() body: RecordRateInput) {
    return this.fx.record(userId, body);
  }

  @Delete('rates/:id')
  @HttpCode(204)
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.fx.remove(userId, id);
  }

  /**
   * Net worth in one currency.
   *
   * `incomplete` and `missing` are part of the contract, not an error case: a
   * total that quietly omits an account looks finished and is not.
   */
  @Get('net-worth')
  async netWorth(
    @CurrentUser() userId: string,
    @Query('currency') currency = 'USD',
    @Query('asOf') asOf?: string,
  ) {
    const result = await this.fx.netWorth(userId, currency, asOf);

    return {
      ...result,
      amountFormatted: formatMoney(money(result.amount, result.currency)),
      byCurrency: result.byCurrency.map((total) => ({
        ...total,
        amountFormatted: formatMoney(money(total.amount, total.currency)),
      })),
    };
  }
}
