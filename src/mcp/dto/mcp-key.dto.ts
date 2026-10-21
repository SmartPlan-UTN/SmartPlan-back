import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateMcpKeyDto {
  @ApiProperty({
    description: 'Human label to tell keys apart, e.g. the bot that uses it.',
    example: 'Grok bot - catalog loader',
  })
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 100)
  name: string;
}

/** A key as listed: never includes the key or its hash. */
export class McpKeyResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'First characters of the key.' })
  prefix: string;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: Date }) lastUsedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) revokedAt: Date | null;
}

/** Returned only once, when the key is generated. */
export class CreatedMcpKeyResponseDto extends McpKeyResponseDto {
  @ApiProperty({
    description:
      'The API key. It is shown only in this response and cannot be recovered.',
  })
  key: string;
}
