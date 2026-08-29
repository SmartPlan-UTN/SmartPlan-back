import {
  ActivityLocationDto,
  CategorySummaryDto,
} from '../../activities/dto/activity-response.dto';
import type { ViewerPlanState } from '../plan-selectability';

export interface PlanSummaryDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalCost: number;
  estimatedTotalDuration: number;
  activityCount: number;
  averageRating: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
  /** Activity names in itinerary order, e.g. `["Bodega", "Almuerzo"]` (CU12). */
  activityNames: string[];
  /**
   * Representative image for the plan. The domain has no plan/activity image
   * source yet, so this is currently always `null`; the field is part of the
   * contract so the recommendation card (CU20) can adopt real images later
   * without a breaking change.
   */
  imageUrl: string | null;
  status: { key: string; name: string };
  viewerPlanState: ViewerPlanState;
}

export interface PlanActivityDto {
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string | null;
  averageRating: number;
  ratingCount: number;
  categories: CategorySummaryDto[];
  locations: ActivityLocationDto[];
}

export interface PlanDetailItemDto {
  id: number;
  order: number;
  estimatedCost: number;
  estimatedDuration: number;
  activity: PlanActivityDto;
}

export interface PlanDetailResponseDto extends PlanSummaryDto {
  details: PlanDetailItemDto[];
  /**
   * What this plan means for the caller (CU22). Ownership and visibility are
   * irrelevant: any authenticated viewer of a non-`cancelled` plan gets
   * `selectable` (or `selected` once they hold an intention). An anonymous
   * viewer always gets `view-only`.
   */
  viewerPlanState: ViewerPlanState;
}

/**
 * Result of `PATCH /plans/:id/select` (CU22).
 */
export interface PlanSelectionResponseDto {
  id: number;
  planRequestId: number | null;
  status: { key: string; name: string };
  viewerPlanState: ViewerPlanState;
}
