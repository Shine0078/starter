import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { CurrentSessionId, CurrentUser, ReqContext } from '../auth/auth.guard';
import type { RequestContext } from '../auth/auth.service';
import { ExportDataDto, UpdateConsentDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  dashboard(@CurrentUser() userId: string) {
    return this.privacy.dashboard(userId);
  }

  @Patch('consents/:kind')
  updateConsent(
    @CurrentUser() userId: string,
    @Param('kind') kind: string,
    @Body() body: UpdateConsentDto,
  ) {
    return this.privacy.updateOptionalConsent(userId, kind, body.granted);
  }

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
