import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlanVisibility } from '../entities/plan.entity';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * One itinerary stop: either a catalog activity (`activityId`) or the
 * intrinsic action of a place (`placeId` + `action`, e.g. dinner at a
 * restaurant). Exactly one of the two shapes.
 */
export class PlanComposerStopDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  activityId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  placeId?: number;

  @IsString()
  @MaxLength(40)
  @IsOptional()
  action?: string;

  /** Present only when this stop already belongs to the plan being edited. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  detailId?: number;
}

export class CreatePlanComposerDto {
  @IsUUID()
  requestId: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleCount: number;

  @IsEnum(PlanVisibility)
  visibility: PlanVisibility;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlanComposerStopDto)
  stops: PlanComposerStopDto[];
}

export class UpdatePlanComposerDto {
  @IsUUID()
  requestId: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleCount: number;

  @IsEnum(PlanVisibility)
  visibility: PlanVisibility;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlanComposerStopDto)
  stops: PlanComposerStopDto[];
}
