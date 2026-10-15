import { Transform, Type } from 'class-transformer';
import { PriceInputDto } from '../../common/pricing/price-input.dto';
import { ValidateNested } from 'class-validator';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ActivitySearchConstraintsDto } from './activity-search-constraints.dto';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdminActivityDto extends ActivitySearchConstraintsDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  name: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 5000)
  description: string;

  /**
   * Structured price. Omitted ⇒ the price is UNKNOWN (never 0).
   * Takes precedence over the legacy `estimatedCost`.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceInputDto)
  price?: PriceInputDto;

  /**
   * @deprecated Legacy single amount; interpreted as a curated FIXED price of
   * unspecified unit. A legacy `0` is rejected: say FREE or UNKNOWN via
   * `price` so a missing price can never masquerade as free.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  estimatedCost?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(525_600)
  estimatedDuration: number;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(80)
  @IsOptional()
  type?: string | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  categoryIds: number[];

  @Type(() => Number)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  placeIds?: number[];
}

export class UpdateAdminActivityDto extends ActivitySearchConstraintsDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 150)
  name?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PriceInputDto)
  price?: PriceInputDto;

  /** @deprecated See CreateAdminActivityDto.estimatedCost. */
  @Type(() => Number)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  estimatedCost?: number;

  @Type(() => Number)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(525_600)
  estimatedDuration?: number;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(80)
  @IsOptional()
  type?: string | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @IsOptional()
  categoryIds?: number[];

  @Type(() => Number)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  placeIds?: number[];
}
