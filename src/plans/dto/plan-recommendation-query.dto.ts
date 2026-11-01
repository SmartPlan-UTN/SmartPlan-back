import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export class PlanRecommendationQueryDto extends PaginatedQueryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  /**
   * Radius, in km, for the distance filter. Only applied when `latitude` and
   * `longitude` are present. Falls back to the user's `maxDistanceKm`
   * preference, then to {@link DEFAULT_RECOMMENDATION_RADIUS_KM}.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(500)
  @IsOptional()
  maxDistanceKm?: number;
}
