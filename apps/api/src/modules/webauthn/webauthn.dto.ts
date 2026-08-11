import { Type } from 'class-transformer';
import {
  IsBase64,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class RegistrationResponseDto {
  @IsBase64()
  @IsString()
  clientDataJSON!: string;

  @IsBase64()
  @IsString()
  attestationObject!: string;
}

export class RegistrationVerifyDto {
  @IsString()
  @Length(1, 512)
  id!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => RegistrationResponseDto)
  response!: RegistrationResponseDto;
}

export class LoginOptionsDto {
  @IsOptional()
  @IsString()
  @Length(1, 320)
  email?: string;
}

export class LoginResponseDto {
  @IsBase64()
  @IsString()
  clientDataJSON!: string;

  @IsBase64()
  @IsString()
  authenticatorData!: string;

  @IsBase64()
  @IsString()
  signature!: string;
}

export class LoginVerifyDto {
  @IsString()
  @Length(1, 512)
  id!: string;

  @IsOptional()
  @IsString()
  @Length(1, 320)
  email?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LoginResponseDto)
  response!: LoginResponseDto;
}
