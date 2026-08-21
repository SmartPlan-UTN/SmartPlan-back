import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export enum CategorySortField {
  NAME = 'name',
}

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CategoryListQueryDto extends PaginatedQueryDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  search?: string;

  @IsEnum(CategorySortField)
  @IsOptional()
  declare sortBy?: CategorySortField;
}
