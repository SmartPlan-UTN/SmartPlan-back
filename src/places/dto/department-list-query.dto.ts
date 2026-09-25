import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export enum DepartmentListSortField {
  NAME = 'name',
}

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** "Localidad" filter option list, scoped to a "Provincia" (CU10). */
export class DepartmentListQueryDto extends PaginatedQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId: number;

  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @IsEnum(DepartmentListSortField)
  @IsOptional()
  declare sortBy?: DepartmentListSortField;
}
