import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
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

  /** "Provincia" filter: only activities with a meeting point in this city. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  cityId?: number;

  /** "Localidad" filter: only activities with a meeting point in this
   * department. Independent from `cityId` — the frontend sends both once a
   * department is chosen, since the department already implies its city. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  departmentId?: number;
}
