import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
  Max,
  ValidateNested,
} from 'class-validator';

import { TRAVEL_MODES, type TravelMode } from '../../common/types/travel-mode';
const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;

export class PlanRequestContextDto {
  @ApiPropertyOptional({ enum: TRAVEL_MODES })
  @IsOptional()
  @IsIn(TRAVEL_MODES)
  travelMode?: TravelMode;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxDistanceKm?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  budget?: number;

  @IsOptional()
  @IsInt()
  idDepartment?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  partySize?: number;

  @IsOptional()
  @IsIn(TIMES_OF_DAY)
  timeOfDay?: (typeof TIMES_OF_DAY)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(525600)
  availableDuration?: number;

  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;
}

export class CreatePlanRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  query: string;

  @IsOptional()
  @ApiPropertyOptional({ type: () => PlanRequestContextDto })
  @Type(() => PlanRequestContextDto)
  @ValidateNested()
  context?: PlanRequestContextDto;
}
