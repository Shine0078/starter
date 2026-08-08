import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import {
  CurrentSessionId,
  CurrentUser,
  Public,
  ReqContext,
} from './auth.guard';
import { AuthService, type RequestContext } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Tighter limits than the global default on the three unauthenticated
   * endpoints. These are the ones worth attacking: registration for spam,
   * login for credential stuffing, refresh for token guessing.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() body: RegisterDto, @ReqContext() context: RequestContext) {
    return this.auth.register(body.email, body.password, body.displayName ?? null, context);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() body: LoginDto, @ReqContext() context: RequestContext) {
    return this.auth.login(body.email, body.password, context);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: RefreshDto, @ReqContext() context: RequestContext) {
    return this.auth.refresh(body.refreshToken, context);
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @CurrentUser() userId: string,
    @CurrentSessionId() sessionId: string,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.auth.logout(userId, sessionId, context);
  }

  /** Ends every session, including this one. The response to a lost device. */
  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() userId: string, @ReqContext() context: RequestContext) {
    return this.auth.logoutAll(userId, context);
  }

  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.auth.currentUser(userId);
  }

  @Get('sessions')
  sessions(@CurrentUser() userId: string, @CurrentSessionId() sessionId: string) {
    return this.auth.listSessions(userId, sessionId);
  }

  @HttpCode(204)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.auth.revokeSession(userId, id, context);
  }
}
