import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

/** Only plan listings can be ordered; experiences and the feed are by date. */
export class CommunityPlansQueryDto extends CommunityQueryDto {
  @IsIn(['recent', 'popular', 'highest_rated', 'most_reviewed'])
  @IsOptional()
  sort: 'recent' | 'popular' | 'highest_rated' | 'most_reviewed' = 'recent';
}

export class CommunityFeedQueryDto extends CommunityQueryDto {
  @IsIn(['all', 'plans', 'experiences'])
  @IsOptional()
  type: 'all' | 'plans' | 'experiences' = 'all';
}
