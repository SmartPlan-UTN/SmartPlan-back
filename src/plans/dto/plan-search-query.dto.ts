import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExplorationQueryDto } from '../../common/search/exploration-query.dto';

export enum PlanSortField {
  RELEVANCE = 'relevance',
  PRICE = 'price',
  RATING = 'rating',
  DISTANCE = 'distance',
}

function normalizeOutingType(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class PlanSearchQueryDto extends ExplorationQueryDto {
  /** Outing type filter. See docs/exploration-api.md. */
  @Transform(({ value }) => normalizeOutingType(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  outingType?: string;

  @IsEnum(PlanSortField)
  @IsOptional()
  declare sortBy?: PlanSortField;
}
