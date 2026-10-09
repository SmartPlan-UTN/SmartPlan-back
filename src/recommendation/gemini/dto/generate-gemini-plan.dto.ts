import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GenerateGeminiPlanDto {
  @IsNumber()
  @Type(() => Number)
  budget: number;

  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  peopleCount: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  availableDurationMinutes: number;

  @IsString({ each: true })
  preferences: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
