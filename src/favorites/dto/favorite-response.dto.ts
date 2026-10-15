import type { PlanPriceSummaryDto, PriceDto } from '../../common/pricing/price';

export interface FavoriteActivitySummaryDto {
  id: number;
  name: string;
  description: string;
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  type: string | null;
}

export interface FavoritePlanSummaryDto extends PlanPriceSummaryDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalDuration: number;
  peopleCount: number;
  activityCount: number;
  status: { key: string; name: string };
}

export interface FavoriteActivityDto {
  id: number;
  idActivity: number;
  savedAt: Date;
  activity: FavoriteActivitySummaryDto;
}

export interface FavoritePlanDto {
  id: number;
  idPlan: number;
  savedAt: Date;
  plan: FavoritePlanSummaryDto;
}
