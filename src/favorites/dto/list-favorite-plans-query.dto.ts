import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum FavoritePlanSortField {
  SAVED_AT = 'savedAt',
  TITLE = 'title',
  ESTIMATED_TOTAL_COST = 'estimatedTotalCost',
}

export class ListFavoritePlansQueryDto extends PaginatedQueryDto {
  @IsEnum(FavoritePlanSortField)
  @IsOptional()
  declare sortBy?: FavoritePlanSortField;

  @IsEnum(SortDirection)
  @IsOptional()
  override direction: SortDirection = SortDirection.DESC;
}
