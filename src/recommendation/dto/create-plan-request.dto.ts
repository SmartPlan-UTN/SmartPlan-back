import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { OCCASION_KEYS, type Occasion } from '../../catalog/taxonomy';
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

  /** "En casa" chip: only games and plans at the Hogar. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  atHome?: boolean;

  /** "Gratis" chip: only evidenced FREE prices (UNKNOWN is never free). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  freeOnly?: boolean;

  /** Explicit occasions; added to the ones read from the text. */
  @ApiPropertyOptional({ enum: OCCASION_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(OCCASION_KEYS, { each: true })
  occasions?: Occasion[];
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
