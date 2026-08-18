import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser, Public, ReqContext } from '../auth/auth.guard';
import { AuthService, type RequestContext } from '../auth/auth.service';
import {
  LoginOptionsDto,
  LoginVerifyDto,
  RegistrationOptionsDto,
  RegistrationVerifyDto,
  RemoveCredentialDto,
} from './webauthn.dto';
import { WebAuthnService } from './webauthn.service';

@Controller('webauthn')
export class WebAuthnController {
  constructor(
    private readonly webauthn: WebAuthnService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('status')
  status() {
    return { available: this.webauthn.available };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register/options')
  async registerOptions(
    @CurrentUser() userId: string,
    @Body() body: RegistrationOptionsDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.auth.requireRecentPassword(
      userId,
      body.password,
      body.mfaCode,
      context,
    );
    const user = await this.auth.currentUser(userId);
    return this.webauthn.registrationOptions(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register/verify')
  async registerVerify(
    @CurrentUser() userId: string,
    @Body() body: RegistrationVerifyDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.auth.requireRecentPassword(userId, body.password, body.mfaCode, context);
    return this.webauthn.registrationVerify(userId, body, context);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/options')
  async loginOptions(@Body() body: LoginOptionsDto) {
    return this.webauthn.loginOptions(body.email ?? undefined);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/verify')
  async loginVerify(@Body() body: LoginVerifyDto, @ReqContext() context: RequestContext) {
    return this.webauthn.loginVerify(body, context);
  }

  @Get('credentials')
  async credentials(@CurrentUser() userId: string) {
    return { credentials: await this.webauthn.listCredentials(userId) };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('credentials/:id')
  @HttpCode(204)
  async removeCredential(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: RemoveCredentialDto,
    @ReqContext() context: RequestContext,
  ) {
    await this.auth.requireRecentPassword(userId, body.password, body.mfaCode, context);
    await this.webauthn.removeCredential(userId, id, context);
  }
}
