import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export enum PlaceSortField {
  NAME = 'name',
}

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PlaceListQueryDto extends PaginatedQueryDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  departmentId?: number;

  @IsEnum(PlaceSortField)
  @IsOptional()
  declare sortBy?: PlaceSortField;
}
