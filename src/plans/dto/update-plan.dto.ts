import { Transform, Type } from 'class-transformer';
import {
  IsInt,
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

export class UpdatePlanDto {
  // `@ValidateIf` instead of `@IsOptional`: `title` is NOT NULL in the
  // database. `@IsOptional` treats an explicit `null` the same as an
  // absent field and skips validation entirely, so `{ "title": null }`
  // would sail through as valid, reach `update()` with `dto.title !==
  // undefined`, and fail the NOT NULL constraint as an unhandled 500
  // instead of a 400. Validating whenever the field isn't `undefined`
  // means an explicit `null` still gets validated, and correctly fails
  // `@IsString()`.
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 150)
  title?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;

  // Same reasoning as `title`: `peopleCount` is NOT NULL.
  @Type(() => Number)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleCount?: number;
}
