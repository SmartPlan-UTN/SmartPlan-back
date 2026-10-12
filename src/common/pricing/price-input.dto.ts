import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  InvalidPriceError,
  PRICE_KINDS,
  PRICE_UNITS,
  type PriceInput,
  type PriceKind,
  type PriceUnit,
} from './price';

/** Sources an administrator may assert; the rest are system-assigned. */
export const ADMIN_PRICE_SOURCES = ['OFFICIAL', 'CURATED'] as const;
export type AdminPriceSource = (typeof ADMIN_PRICE_SOURCES)[number];

export class PriceInputDto {
  @IsIn(PRICE_KINDS)
  kind: PriceKind;

  @Type(() => Number)
  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  min?: number | null;

  @Type(() => Number)
  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  max?: number | null;

  @IsOptional()
  @IsIn(PRICE_UNITS)
  unit?: PriceUnit | null;

  @IsOptional()
  @IsIn(ADMIN_PRICE_SOURCES)
  source?: AdminPriceSource | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/\S+$/i, {
    message: 'sourceRef must be an http(s) URL',
  })
  sourceRef?: string | null;

  @IsOptional()
  @IsDateString()
  verifiedAt?: string | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function priceInputFromDto(
  dto: PriceInputDto,
  now: Date = new Date(),
): PriceInput {
  const verifiedAt = dto.verifiedAt ? new Date(dto.verifiedAt) : now;
  if (verifiedAt.getTime() > now.getTime() + ONE_DAY_MS) {
    // A verification date in the future would keep a price "fresh" forever.
    throw new InvalidPriceError('verifiedAt cannot be in the future.');
  }
  return {
    priceKind: dto.kind,
    priceMin: dto.min ?? null,
    priceMax: dto.max ?? null,
    priceUnit: dto.unit ?? null,
    priceSource: dto.source ?? null,
    priceSourceRef: dto.sourceRef ?? null,
    priceVerifiedAt: verifiedAt,
  };
}
