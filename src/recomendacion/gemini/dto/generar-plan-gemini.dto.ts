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
 * Usa lat/lng crudo en lugar de `idDepartamento` a propósito: el objetivo es
 * validar la integración técnica con Gemini, no resolver el mapeo
 * departamento → coordenada, que queda pendiente para CU17/CU19/CU31 en
 * producción.
 */
export class GenerarPlanGeminiDto {
  @IsNumber()
  @Type(() => Number)
  presupuesto: number;

  @IsLatitude()
  @Type(() => Number)
  latitud: number;

  @IsLongitude()
  @Type(() => Number)
  longitud: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  cantidadPersonas: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  duracionDisponibleMinutos: number;

  @IsString({ each: true })
  preferencias: string[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
