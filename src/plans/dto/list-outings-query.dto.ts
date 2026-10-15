import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';
import type { OutingStatus } from './outing-response.dto';

export const OUTING_STATUSES: readonly OutingStatus[] = ['to_do', 'completed'];

export type OutingSort = 'recent' | 'oldest' | 'cost_desc' | 'cost_asc';

export const OUTING_SORTS: readonly OutingSort[] = [
  'recent',
  'oldest',
  'cost_desc',
  'cost_asc',
];

function parseBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/**
 * `GET /users/me/outings`: "Por hacer" or "Realizadas" (#98), with the
 * filters of "Mis salidas" (#134). Dates are calendar days in Argentina
 * (`YYYY-MM-DD`, inclusive) and apply to when the outing was done, or to when
 * it was chosen while still to do.
 */
export class ListOutingsQueryDto extends PaginatedQueryDto {
  @IsIn(OUTING_STATUSES)
  @IsOptional()
  status?: OutingStatus;

  /** Matches the title or the name of any of its activities. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @IsISO8601({ strict: true })
  @MaxLength(10)
  @IsOptional()
  from?: string;

  @IsISO8601({ strict: true })
  @MaxLength(10)
  @IsOptional()
  to?: string;

  @IsIn(OUTING_SORTS)
  @IsOptional()
  sort?: OutingSort;

  /** Only outings with (`true`) or without (`false`) feedback. */
  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  @IsBoolean()
  @IsOptional()
  rated?: boolean;
}
