import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum CollectionSortField {
  NAME_COLLECTION = 'nameCollection',
  SAVED_AT = 'savedAt',
}

export class ListCollectionsQueryDto extends PaginatedQueryDto {
  @IsEnum(CollectionSortField)
  @IsOptional()
  declare sortBy?: CollectionSortField;

  @IsEnum(SortDirection)
  @IsOptional()
  override direction: SortDirection = SortDirection.DESC;
}
