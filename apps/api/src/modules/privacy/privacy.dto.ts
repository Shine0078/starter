import { IsString, MinLength } from 'class-validator';

export class ExportDataDto {
  @IsString()
  @MinLength(12)
  password!: string;
}
