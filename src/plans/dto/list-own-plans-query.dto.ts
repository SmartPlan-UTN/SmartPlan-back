import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: OwnPlanSortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
