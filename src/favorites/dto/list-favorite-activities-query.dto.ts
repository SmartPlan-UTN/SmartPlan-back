import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: FavoriteActivitySortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
