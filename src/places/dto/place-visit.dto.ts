import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PlaceVisitParamsDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number;
}

export class PlaceVisitResponseDto {
  @ApiProperty({
    description: 'The activity ID used by plans, favorites and ratings.',
  })
  activityId: number;
}
