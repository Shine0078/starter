import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/auth.guard';
import { RegisterPushTokenDto } from './push.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('device')
  registerDevice(
    @CurrentUser() userId: string,
    @Body() body: RegisterPushTokenDto,
  ) {
    return this.push.register(userId, body.token, body.platform);
  }

  @Delete('device')
  @HttpCode(204)
  async unregisterDevice(
    @CurrentUser() userId: string,
    @Body() body: { token: string },
  ) {
    await this.push.unregister(userId, body.token);
  }
}
