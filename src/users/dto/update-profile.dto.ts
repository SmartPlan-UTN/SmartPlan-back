import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** Digits, spaces, and the punctuation an international phone number uses
 * (`+54 11 4321 0987`). Rejects letters and anything else a free-text field
 * would otherwise accept. */
const PHONE_PATTERN = /^[+\d][\d\s()-]{5,29}$/;

export class UpdateProfileDto {
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
}
