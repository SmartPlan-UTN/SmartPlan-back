import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../pagination/paginated-query.dto';

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parseNumberList(value: unknown): unknown {
  const values = Array.isArray(value) ? value : String(value).split(',');

  return values
    .flatMap((item) => String(item).split(','))
    .filter((item) => item.length > 0)
    .map(Number);
}

export class ExplorationQueryDto extends PaginatedQueryDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @Transform(({ value }) => parseNumberList(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  categoryIds?: number[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(500)
  @IsOptional()
  maxDistanceKm?: number;
}
