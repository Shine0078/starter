import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { CurrentUser, Public } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import {
  LoginOptionsDto,
  LoginVerifyDto,
  RegistrationVerifyDto,
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

  @Post('register/options')
  async registerOptions(@CurrentUser() userId: string) {
    const user = await this.auth.currentUser(userId);
    return this.webauthn.registrationOptions(user);
  }

  @Post('register/verify')
  async registerVerify(
    @CurrentUser() userId: string,
    @Body() body: RegistrationVerifyDto,
  ) {
    return this.webauthn.registrationVerify(userId, body);
  }

  @Post('login/options')
  async loginOptions(@Body() body: LoginOptionsDto) {
    return this.webauthn.loginOptions(body.email ?? undefined);
  }

  @Post('login/verify')
  async loginVerify(@Body() body: LoginVerifyDto) {
    return this.webauthn.loginVerify(body, body.email ?? undefined);
  }

  @Get('credentials')
  async credentials(@CurrentUser() userId: string) {
    return { credentials: await this.webauthn.listCredentials(userId) };
  }

  @Delete('credentials/:id')
  @HttpCode(204)
  async removeCredential(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ) {
    await this.webauthn.removeCredential(userId, id);
  }
}
