import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length, ValidateIf } from 'class-validator';

export enum CategoryStatusKey {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdminCategoryDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 80)
  name: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 500)
  description?: string;
}

export class UpdateAdminCategoryDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 80)
  name?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Length(1, 500)
  description?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(CategoryStatusKey)
  status?: CategoryStatusKey;
}
