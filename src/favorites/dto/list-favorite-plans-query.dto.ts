import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: FavoritePlanSortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
