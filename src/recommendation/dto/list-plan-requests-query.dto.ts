import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';

export enum PlanRequestSortField {
  REQUESTED_AT = 'requestedAt',
}

/** `GET /plan-requests`: the caller's own requests, newest first by default. */
export class ListPlanRequestsQueryDto extends PaginatedQueryDto {
  @IsEnum(PlanRequestSortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: PlanRequestSortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
