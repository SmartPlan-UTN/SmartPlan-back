import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { FeedbackStatusKey } from './admin-list-query.dto';

export class ReviewFeedbackDto {
  @IsEnum([FeedbackStatusKey.PROCESSED, FeedbackStatusKey.DISCARDED])
  status: FeedbackStatusKey.PROCESSED | FeedbackStatusKey.DISCARDED;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
