import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { RatingModerationStatus } from '../entities/rating.entity';

export class ModerateRatingDto {
  @IsEnum([RatingModerationStatus.Approved, RatingModerationStatus.Rejected])
  status: RatingModerationStatus.Approved | RatingModerationStatus.Rejected;

  @ValidateIf(
    (object: ModerateRatingDto) =>
      object.status === RatingModerationStatus.Rejected,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
