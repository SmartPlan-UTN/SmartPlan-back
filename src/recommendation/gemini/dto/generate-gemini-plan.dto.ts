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

/**
 * Entrada del spike de integración con Gemini (ticket #32).
 *
 * Usa lat/lng crudo en place de `idDepartment` a propósito: el objetivo es
 * validar la integración técnica con Gemini, no resolver el mapeo
 * department → coorderada, que queda pending para CU17/CU19/CU31 en
 * producción.
 */
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
