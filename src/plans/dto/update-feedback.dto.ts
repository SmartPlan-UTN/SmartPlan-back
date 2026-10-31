import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateFeedbackDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  comment?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  shared?: boolean;
}
