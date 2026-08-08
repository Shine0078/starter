import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../domain/auth/password-policy';

/**
 * Validation at the edge. The global ValidationPipe runs with
 * `whitelist: true`, so any property not declared here is stripped before it
 * reaches a service — a client cannot smuggle in `status: 'active'` or an `id`.
 *
 * MaxLength on the password is not cosmetic: Argon2's cost scales with input
 * size, so an unbounded field is a cheap way to burn server CPU.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  acceptedTerms?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  termsVersion?: string;

  @IsOptional()
  @IsBoolean()
  acceptedPrivacyNotice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  privacyVersion?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email!: string;

  // No MinLength here. Rejecting a short password before checking it tells an
  // attacker their guess was malformed rather than merely wrong, and it makes
  // the response faster than a real verification.
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @Equals('DELETE', { message: 'Type DELETE to confirm permanent account deletion.' })
  confirmation!: string;
}

export class EmailDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email!: string;
}

export class ActionTokenDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

export class ConfirmPasswordResetDto extends ActionTokenDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}
