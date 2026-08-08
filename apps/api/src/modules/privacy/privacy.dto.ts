import { IsBoolean, IsString, MinLength } from 'class-validator';

export class ExportDataDto {
  @IsString()
  @MinLength(12)
  password!: string;
}

export class UpdateConsentDto {
  @IsBoolean()
  granted!: boolean;
}
