import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum FavoriteActivitySortField {
  SAVED_AT = 'savedAt',
  NAME = 'name',
  ESTIMATED_COST = 'estimatedCost',
}

export class ListFavoriteActivitiesQueryDto extends PaginatedQueryDto {
  @IsEnum(FavoriteActivitySortField)
  @IsOptional()
  declare sortBy?: FavoriteActivitySortField;

  @IsEnum(SortDirection)
  @IsOptional()
  override direction: SortDirection = SortDirection.DESC;
}
