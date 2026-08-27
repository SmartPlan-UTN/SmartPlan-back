import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;

export class PlanRequestContextDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @IsOptional()
  @IsInt()
  idDepartment?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;

  @IsOptional()
  @IsIn(TIMES_OF_DAY)
  timeOfDay?: (typeof TIMES_OF_DAY)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  availableDuration?: number;
}

export class CreatePlanRequestDto {
  @IsString()
  @MinLength(3)
  query: string;

  @IsOptional()
  @Type(() => PlanRequestContextDto)
  @ValidateNested()
  context?: PlanRequestContextDto;
}
