import { IsEnum, IsOptional } from 'class-validator';
import { ExplorationQueryDto } from '../../common/search/exploration-query.dto';

export enum ActivitySortField {
  RELEVANCE = 'relevance',
  PRICE = 'price',
  RATING = 'rating',
  DISTANCE = 'distance',
}

export class ActivitySearchQueryDto extends ExplorationQueryDto {
  @IsEnum(ActivitySortField)
  @IsOptional()
  declare sortBy?: ActivitySortField;
}
