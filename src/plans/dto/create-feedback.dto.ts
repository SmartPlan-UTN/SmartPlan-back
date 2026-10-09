import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
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

  /**
   * Shares the experience with the community (#106). Private by default:
   * the feedback only improves recommendations unless the author opts in.
   */
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}
