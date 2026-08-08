import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { BankLink } from '../../ports/banking';
import { CurrentUser, ReqContext } from '../auth/auth.guard';
import { AuthService, type RequestContext } from '../auth/auth.service';
import { CreateLinkTokenDto, ExchangeBankTokenDto } from './banking.dto';
import { BankingService } from './banking.service';

@Controller('bank-links')
export class BankingController {
  constructor(
    private readonly banking: BankingService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const links = await this.banking.list(userId);
    return { count: links.length, links: links.map(present) };
  }

  @Post('link-token')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async linkToken(
    @CurrentUser() userId: string,
    @Body() body: CreateLinkTokenDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.auth.verifyBankLinkStepUp(userId, body.password, context);
    return this.banking.createLinkToken(userId, body.linkId);
  }

  @Post('exchange')
  async exchange(
    @CurrentUser() userId: string,
    @Body() body: ExchangeBankTokenDto,
  ) {
    return present(
      await this.banking.exchange(
        userId,
        body.publicToken,
        body.institutionName,
        body.institutionId ?? null,
      ),
    );
  }

  @Post(':id/sync')
  sync(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.banking.sync(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  disconnect(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.banking.disconnect(userId, id);
  }
}

function present(link: BankLink) {
  const { encryptedAccessToken: _secret, cursor: _cursor, providerItemId: _item, ...safe } = link;
  return safe;
}
