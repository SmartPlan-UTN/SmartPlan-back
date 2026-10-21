import { IsString, Length } from 'class-validator';
import { IsNewPassword } from '../../common/validation/new-password.decorator';

export class ResetPasswordDto {
  @IsString()
  @Length(32, 200)
  token: string;

  @IsNewPassword()
  newPassword: string;
}
