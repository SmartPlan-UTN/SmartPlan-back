import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EachHasOneStopTarget,
  IsCalendarDate,
  IsClockTime,
} from './stop-target.validation';

export class ComposerCheckStopDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  placeId?: number;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(720)
  durationMinutes?: number;
}

/** The stops a person assembled, to check against reality. */
export class ComposerCheckDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @EachHasOneStopTarget()
  @ValidateNested({ each: true })
  @Type(() => ComposerCheckStopDto)
  stops: ComposerCheckStopDto[];

  @IsCalendarDate()
  date: string;

  @IsClockTime()
  startTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  peopleCount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  budget?: number;

  @IsOptional()
  @IsIn(['drive', 'walk', 'bicycle'])
  travelMode?: 'drive' | 'walk' | 'bicycle';
}
