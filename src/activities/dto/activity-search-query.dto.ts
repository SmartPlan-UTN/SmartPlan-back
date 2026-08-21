import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExplorationQueryDto } from '../../common/search/exploration-query.dto';

export enum ActivitySortField {
  RELEVANCE = 'relevance',
  PRICE = 'price',
  RATING = 'rating',
  DISTANCE = 'distance',
}

function normalizeType(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ActivitySearchQueryDto extends ExplorationQueryDto {
  /** Activity type filter. See docs/exploration-api.md. */
  @Transform(({ value }) => normalizeType(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  type?: string;

  @IsEnum(ActivitySortField)
  @IsOptional()
  declare sortBy?: ActivitySortField;
}
