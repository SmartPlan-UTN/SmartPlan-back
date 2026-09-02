import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export enum CityListSortField {
  NAME = 'name',
}

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** "Provincia" filter option list (CU10). */
export class CityListQueryDto extends PaginatedQueryDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @IsEnum(CityListSortField)
  @IsOptional()
  declare sortBy?: CityListSortField;
}
