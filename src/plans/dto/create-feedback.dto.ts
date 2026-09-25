import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  FEEDBACK_TAGS,
  FeedbackTag,
} from '../../recommendation/entities/feedback.entity';

export class CreateFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FEEDBACK_TAGS, { each: true })
  tags?: FeedbackTag[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  actualCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualDuration?: number;
}
