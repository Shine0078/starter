import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH } from '../../domain/auth/password-policy';

export class CreateLinkTokenDto {
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @IsOptional()
  @IsUUID()
  linkId?: string;
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
