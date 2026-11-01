import { OCCASION_KEYS, type Occasion } from '../../catalog/taxonomy';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  @ApiPropertyOptional({ enum: ActivitySortField })
  declare sortBy?: string;

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

  /**
   * Occasions (`Occasion` keys, comma-separated): activities that suit ANY
   * of them, e.g. `romantic,quiet`.
   */
  @Transform(({ value }) => parseOccasionList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(OCCASION_KEYS, { each: true })
  @IsOptional()
  @ApiPropertyOptional({ enum: OCCASION_KEYS, isArray: true })
  occasions?: Occasion[];

  /** Only games and plans at the Hogar ("En casa / donde estén"). */
  @Transform(({ value }) => parseBooleanFlag(value))
  @IsBoolean()
  @IsOptional()
  atHome?: boolean;

  /** Only activities with an evidenced FREE price (UNKNOWN is never free). */
  @Transform(({ value }) => parseBooleanFlag(value))
  @IsBoolean()
  @IsOptional()
  free?: boolean;
}

function parseOccasionList(value: unknown): unknown {
  const values = Array.isArray(value) ? value : String(value).split(',');
  return [
    ...new Set(
      values
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
}

function parseBooleanFlag(value: unknown): unknown {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}
