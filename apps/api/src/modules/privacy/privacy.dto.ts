import { IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class ExportDataDto {
  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  mfaCode?: string;
}

export class UpdateConsentDto {
  @IsBoolean()
  granted!: boolean;
}
