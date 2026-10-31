import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  COST_BASES,
  type CostBasis,
  TIMES_OF_DAY,
  type TimeOfDay,
} from '../../activities/activity-constraints';
import { OCCASION_KEYS, type Occasion } from '../../catalog/taxonomy';

export class ActivitySearchConstraintsDto {
  @ApiPropertyOptional({ enum: COST_BASES, default: 'per_party' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(COST_BASES)
  costBasis?: CostBasis;

  @ApiPropertyOptional({
    enum: TIMES_OF_DAY,
    isArray: true,
    description: 'Empty means availability is not specified.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(4)
  @IsIn(TIMES_OF_DAY, { each: true })
  availableTimesOfDay?: TimeOfDay[];

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  minPeople?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxPeople?: number | null;

  /**
   * Who it suits and its mood (`Occasion` keys). Without any, the activity
   * is published but never auto-recommended.
   */
  @ApiPropertyOptional({ enum: OCCASION_KEYS, isArray: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(OCCASION_KEYS.length)
  @IsIn(OCCASION_KEYS, { each: true })
  occasions?: Occasion[];
}
