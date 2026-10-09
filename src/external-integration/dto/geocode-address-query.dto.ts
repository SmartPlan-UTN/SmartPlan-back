import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function normalizeText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class GeocodeAddressQueryDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address: string;
}
