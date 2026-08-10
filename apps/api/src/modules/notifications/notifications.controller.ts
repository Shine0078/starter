import { Body, Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';

import type { NotificationPreferences } from '../../domain/types';
import { CurrentUser } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const rows = await this.notifications.list(userId);
    return { count: rows.length, unread: rows.filter((row) => row.readAt === null).length, notifications: rows };
  }

  @Patch(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Patch('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Get('preferences')
  preferences(@CurrentUser() userId: string) {
    return this.notifications.preferences(userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() userId: string,
    @Body() patch: Partial<NotificationPreferences>,
  ) {
    return this.notifications.updatePreferences(userId, patch);
  }
}
