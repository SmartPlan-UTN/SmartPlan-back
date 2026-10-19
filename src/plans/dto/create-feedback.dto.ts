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
import {
  STOP_REPORTS,
  STOP_TAGS,
  type StopReport,
  type StopTag,
} from '../stop-learning.service';

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

/** How one stop of the outing went (all optional, ~1 tap each). */
export class StopFeedbackDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detailId: number;

  @IsOptional()
  @IsIn(['DONE', 'SKIPPED'])
  status?: 'DONE' | 'SKIPPED';

  /** What the whole party spent at this stop (ARS). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  /** "Estaba cerrado", "precio incorrecto"…: triggers a source re-check. */
  @IsOptional()
  @IsIn(STOP_REPORTS)
  report?: StopReport;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(STOP_TAGS, { each: true })
  tags?: StopTag[];
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

  /** Per-stop outcomes (skipped, spend, wrong data, tags), all optional. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StopFeedbackDto)
  stops?: StopFeedbackDto[];

  /**
   * Shares the experience with the community (#106). Private by default:
   * the feedback only improves recommendations unless the author opts in.
   */
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}
