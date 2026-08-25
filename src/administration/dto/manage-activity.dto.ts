import { Transform, Type } from 'class-transformer';
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

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdminActivityDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  name: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 5000)
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  estimatedCost: number;

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
}

export class UpdateAdminActivityDto {
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
}
