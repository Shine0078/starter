import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public } from '../auth/auth.guard';
import { BankingService } from './banking.service';

@Controller('bank-webhooks')
export class PlaidWebhookController {
  constructor(private readonly banking: BankingService) {}

  @Public()
  @Throttle({ default: { limit: 1_000, ttl: 60_000 } })
  @HttpCode(202)
  @Post('plaid')
  plaid(
    @Req() request: RawBodyRequest<Request>,
    @Headers('plaid-verification') signature?: string,
  ) {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Signed raw webhook body is required.');
    }
    return this.banking.acceptWebhook(request.rawBody, signature);
  }
}
