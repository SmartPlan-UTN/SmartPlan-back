import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PlacePhotoQueryDto {
  @ApiPropertyOptional({ minimum: 64, maximum: 1600, default: 800 })
  @Type(() => Number)
  @IsInt()
  @Min(64)
  @Max(1600)
  @IsOptional()
  width: number = 800;
}
