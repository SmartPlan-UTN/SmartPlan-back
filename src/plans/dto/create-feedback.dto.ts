import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import {
  FEEDBACK_TAGS,
  FeedbackTag,
} from '../../recommendation/entities/feedback.entity';

/** What the person paid for ONE activity of the outing. */
export class ActivityCostDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activityId: number;

  /** For the person's whole party; never derived from the plan total. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

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

  /** How many people the reported costs were shared among. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  partySize?: number;

  /**
   * Optional per-activity costs. They feed price estimates for each activity
   * and are stored apart from `actualCost`, which is never split across them.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ActivityCostDto)
  activityCosts?: ActivityCostDto[];

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
