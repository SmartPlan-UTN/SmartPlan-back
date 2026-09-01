import { IsString, Length, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword: string;

  // Length alone used to be the only enforced rule here, with uppercase/
  // digit/symbol shown in `ChangePasswordForm`'s checklist as informational
  // hints only. Those rows are now a real requirement (CU6), so the backend
  // enforces the same rule instead of trusting the frontend gate — a direct
  // API call could otherwise set a password the UI would have refused.
  @IsString()
  @Length(8, 128)
  @Matches(/(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, {
    message:
      'newPassword must include at least one uppercase letter and one number or symbol (!@#$%^&*)',
  })
  newPassword: string;
}
