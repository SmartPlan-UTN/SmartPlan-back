import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

/** Digits, spaces, and the punctuation an international phone number uses
 * (`+54 11 4321 0987`). Rejects letters and anything else a free-text field
 * would otherwise accept. */
const PHONE_PATTERN = /^[+\d][\d\s()-]{5,29}$/;

export class UpdateProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/^@/, '')
      : value,
  )
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(3, 24)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username may contain lowercase letters, numbers, and underscores',
  })
  username?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Length(0, 160)
  bio?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  lastName: string;

  /** Optional: `undefined` leaves the stored value untouched, `null` clears
   * it. Both `GET`/`PATCH /users/me` already treat the field this way. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, {
    message: 'phone must be a valid phone number',
  })
  phone?: string | null;

  /** Reminder emails (#127). Omitting it leaves the stored value untouched;
   * unlike `phone`, `null` is rejected: the preference is never unknown. */
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  emailRemindersEnabled?: boolean;
}
