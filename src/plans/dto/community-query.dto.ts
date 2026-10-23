import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

function trimQuery(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CommunityQueryDto extends PaginatedQueryDto {
  @Transform(({ value }) => trimQuery(value))
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;
}
