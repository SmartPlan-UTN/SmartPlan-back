import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PlanStatusKey } from './admin-list-query.dto';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateAdminPlanDto {
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

  @Type(() => Number)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleCount?: number;

  @IsEnum(PlanStatusKey)
  @IsOptional()
  status?: PlanStatusKey;
}
