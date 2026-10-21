import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * `GET /activity-suggestions`: what the person wrote about the plan they are
 * building, and the activities it already has (#98).
 */
export class ActivitySuggestionsQueryDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  /** Comma-separated, e.g. `excludeActivityIds=3,8`. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .filter((part) => part.trim() !== '')
          .map(Number)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  excludeActivityIds?: number[];
}
