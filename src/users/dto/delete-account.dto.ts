import { IsString, Length } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @Length(8, 128)
  currentPassword: string;
}
