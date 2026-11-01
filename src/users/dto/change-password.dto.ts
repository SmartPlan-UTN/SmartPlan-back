import { IsString, Length } from 'class-validator';
import { IsNewPassword } from '../../common/validation/new-password.decorator';

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}
