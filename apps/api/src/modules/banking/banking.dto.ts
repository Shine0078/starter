import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateLinkTokenDto {
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
