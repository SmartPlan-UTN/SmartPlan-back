import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateCollectionDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 100)
  nameCollection: string;
}
