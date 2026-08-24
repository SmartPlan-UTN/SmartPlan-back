import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateCollectionDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 100)
  @IsOptional()
  nameCollection?: string;
}
