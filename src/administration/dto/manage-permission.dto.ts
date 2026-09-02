import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const PERMISSION_KEY = /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*$/;

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePermissionDto {
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @Matches(PERMISSION_KEY)
  @MaxLength(40)
  key: string;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  description?: string;
}

export class UpdatePermissionDto {
  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description?: string | null;
}

export class ReplaceRolePermissionsDto {
  @Type(() => Number)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds: number[];
}
