import { Module } from '@nestjs/common';

import { loadConfig } from '../../config';
import { WEBAUTHN_CONFIG } from '../../ports/webauthn';
import { AuthModule } from '../auth/auth.module';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnService } from './webauthn.service';

@Module({
  imports: [AuthModule],
  controllers: [WebAuthnController],
  providers: [
    WebAuthnService,
    { provide: WEBAUTHN_CONFIG, useFactory: () => loadConfig().webauthn },
  ],
})
export class WebAuthnModule {}
