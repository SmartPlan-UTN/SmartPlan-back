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

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Parámetros comunes para todos los endpoints de listado.
 *
 * Cada módulo debe restringir `sortBy` a sus campos públicos antes de
 * construir la query. Nunca se interpola este value directamente en SQL.
 */
export class PaginatedQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  direction: SortDirection = SortDirection.ASC;
}
