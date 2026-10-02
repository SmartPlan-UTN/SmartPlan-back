import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { ActivitySearchQueryDto } from './activity-search-query.dto';

export class MapActivitiesQueryDto extends ActivitySearchQueryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  south: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  north: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  west: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  east: number;
}
