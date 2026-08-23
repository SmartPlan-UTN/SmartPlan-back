import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum OwnPlanSortField {
  CREATED_AT = 'createdAt',
}

export class ListOwnPlansQueryDto extends PaginatedQueryDto {
  @IsEnum(OwnPlanSortField)
  @IsOptional()
  declare sortBy?: OwnPlanSortField;

  @IsEnum(SortDirection)
  @IsOptional()
  override direction: SortDirection = SortDirection.DESC;
}
