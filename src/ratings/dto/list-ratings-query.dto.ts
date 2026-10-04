import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ enum: RatingSortField })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  override direction: string = SortDirection.DESC;
}
