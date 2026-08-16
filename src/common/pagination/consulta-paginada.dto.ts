import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum DireccionOrden {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Parámetros comunes para todos los endpoints de listado.
 *
 * Cada módulo debe restringir `ordenarPor` a sus campos públicos antes de
 * construir la consulta. Nunca se interpola este valor directamente en SQL.
 */
export class ConsultaPaginadaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limite = 20;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  ordenarPor?: string;

  @IsEnum(DireccionOrden)
  @IsOptional()
  direccion: DireccionOrden = DireccionOrden.ASC;
}
