import { IsIn, IsString, Length } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @Length(20, 512)
  token!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';
}
