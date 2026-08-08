import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  // Exported because AuthGuard is registered globally in AppModule and needs it.
  exports: [AuthService],
})
export class AuthModule {}
