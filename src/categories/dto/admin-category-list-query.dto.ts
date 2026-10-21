import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';
import { CategoryStatusKey } from './admin-category.dto';

export enum AdminCategorySortField {
  CREATED_AT = 'createdAt',
  NAME = 'name',
  STATUS = 'status',
}

function trimSearch(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListAdminCategoriesQueryDto extends PaginatedQueryDto {
  @Transform(({ value }: { value: unknown }) => trimSearch(value))
  @IsString()
  @MaxLength(80)
  @IsOptional()
  search?: string;

  @IsEnum(CategoryStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: CategoryStatusKey })
  status?: string;

  @IsEnum(AdminCategorySortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: AdminCategorySortField })
  declare sortBy?: string;
}
