import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePlanDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleCount: number;
}
