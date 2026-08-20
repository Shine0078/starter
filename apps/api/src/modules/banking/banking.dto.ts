import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH } from '../../domain/auth/password-policy';
import { LINK_PLATFORMS } from '../../ports/banking';

export class CreateLinkTokenDto {
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mfaCode?: string;

  @IsOptional()
  @IsUUID()
  linkId?: string;

  /**
   * Which Plaid Link surface will open this token.
   *
   * It matters: a token created with `android_package_name` is bound to the
   * Android app and Plaid rejects it in a browser. iOS and web use the
   * configured Universal Link redirect URI. Defaults to `android` so existing
   * clients that predate the web build keep working unchanged.
   */
  @IsOptional()
  @IsString()
  @IsIn([...LINK_PLATFORMS])
  platform?: string;
}

export class ExchangeBankTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  publicToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  institutionName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  institutionId?: string;
}
