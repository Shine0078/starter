import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

/** WebAuthn client payloads are unpadded base64url, not RFC 4648 base64. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export class RegistrationResponseDto {
  @Matches(BASE64URL)
  @IsString()
  clientDataJSON!: string;

  @Matches(BASE64URL)
  @IsString()
  attestationObject!: string;
}

export class RegistrationVerifyDto {
  @IsString()
  @Length(1, 512)
  id!: string;

  @IsString()
  @Length(16, 128)
  ceremonyId!: string;

  @IsString()
  @Length(1, 256)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  mfaCode?: string;

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
  @Matches(BASE64URL)
  @IsString()
  clientDataJSON!: string;

  @Matches(BASE64URL)
  @IsString()
  authenticatorData!: string;

  @Matches(BASE64URL)
  @IsString()
  signature!: string;
}

export class LoginVerifyDto {
  @IsString()
  @Length(1, 512)
  id!: string;

  @IsString()
  @Length(16, 128)
  ceremonyId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LoginResponseDto)
  response!: LoginResponseDto;
}

export class RegistrationOptionsDto {
  @IsString()
  @Length(1, 256)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  mfaCode?: string;
}

export class RemoveCredentialDto {
  @IsString()
  @Length(1, 256)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  mfaCode?: string;
}
