import { IsEnum, IsOptional } from 'class-validator';
import { ExplorationQueryDto } from '../../common/search/exploration-query.dto';

export enum PlanSortField {
  RELEVANCE = 'relevance',
  PRICE = 'price',
  RATING = 'rating',
  DISTANCE = 'distance',
}

export class PlanSearchQueryDto extends ExplorationQueryDto {
  @IsEnum(PlanSortField)
  @IsOptional()
  declare sortBy?: PlanSortField;
}
