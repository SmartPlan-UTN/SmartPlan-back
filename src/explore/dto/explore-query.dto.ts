import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ActivitySearchQueryDto } from '../../activities/dto/activity-search-query.dto';
import { MapActivitiesQueryDto } from '../../activities/dto/map-activities-query.dto';

export const EXPLORE_ITEM_TYPES = ['ALL', 'ACTIVITY', 'PLACE'] as const;
export type ExploreItemType = (typeof EXPLORE_ITEM_TYPES)[number];

export class ExploreQueryDto extends ActivitySearchQueryDto {
  /** Only activities, only places, or both (default). */
  @IsIn(EXPLORE_ITEM_TYPES)
  @IsOptional()
  @ApiPropertyOptional({ enum: EXPLORE_ITEM_TYPES })
  itemType?: ExploreItemType;
}

export class ExploreMapQueryDto extends MapActivitiesQueryDto {
  @IsIn(EXPLORE_ITEM_TYPES)
  @IsOptional()
  @ApiPropertyOptional({ enum: EXPLORE_ITEM_TYPES })
  itemType?: ExploreItemType;
}
