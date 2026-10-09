import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: CollectionSortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
