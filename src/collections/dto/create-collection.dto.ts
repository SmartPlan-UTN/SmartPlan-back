import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalText(value: unknown): unknown {
  const trimmed = trimText(value);
  return trimmed === '' ? null : trimmed;
}

export class CreateCollectionDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 100)
  nameCollection: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
