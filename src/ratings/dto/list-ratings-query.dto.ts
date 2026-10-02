import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum RatingSortField {
  CREATED_AT = 'createdAt',
  SCORE = 'score',
}

export class ListRatingsQueryDto extends PaginatedQueryDto {
  @IsEnum(RatingSortField)
  @IsOptional()
  declare sortBy?: RatingSortField;

  @IsEnum(SortDirection)
  @IsOptional()
  override direction: SortDirection = SortDirection.DESC;
}
