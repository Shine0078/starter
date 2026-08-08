import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';

import { CurrentSessionId, CurrentUser, ReqContext } from '../auth/auth.guard';
import type { RequestContext } from '../auth/auth.service';
import { ExportDataDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('export')
  @HttpCode(200)
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="finverse-data-export.json"')
  exportData(
    @CurrentUser() userId: string,
    @CurrentSessionId() sessionId: string,
    @Body() body: ExportDataDto,
    @ReqContext() context: RequestContext,
  ) {
    return this.privacy.exportData(userId, sessionId, body.password, context);
  }
}
