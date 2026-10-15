import {
  ActivityLocationDto,
  CategorySummaryDto,
} from '../../activities/dto/activity-response.dto';
import type { PlanPriceSummaryDto, PriceDto } from '../../common/pricing/price';
import type { PlanKind, PlanVisibility } from '../entities/plan.entity';
import type { ViewerPlanState } from '../plan-selectability';

export interface PlanSummaryDto extends PlanPriceSummaryDto {
  id: number;
  title: string;
  description: string | null;
  estimatedTotalDuration: number;
  activityCount: number;
  averageRating: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
  /** Activity names in itinerary order, e.g. `["Bodega", "Almuerzo"]` (CU12). */
  activityNames: string[];
  /**
   * Uploaded cover/activity image, otherwise an attributed, quota-guarded
   * photo of a public place. The client must keep the response credit.
   */
  imageUrl: string | null;
  imageSource?: import('../../media/image-source').ImageSource | null;
  status: { key: string; name: string };
  viewerPlanState: ViewerPlanState;
  /**
   * The viewer's outing still to do that was copied from this plan (CU22),
   * so "Lo voy a hacer" can become "Ver en Mis salidas"; `null` otherwise.
   */
  activeOutingId: number | null;
}

export interface PlanActivityDto {
  id: number;
  name: string;
  description: string;
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  type: string | null;
  averageRating: number;
  ratingCount: number;
  categories: CategorySummaryDto[];
  locations: ActivityLocationDto[];
}

export interface PlanDetailItemDto {
  perPersonCost?: number | null;
  id: number;
  order: number;
  /** Snapshot lower bound taken when the activity entered the plan. */
  estimatedCost: number | null;
  /** Immutable price snapshot: what the user was shown at save time. */
  price: PriceDto;
  estimatedDuration: number;
  activity: PlanActivityDto;
}

export interface PlanDetailResponseDto extends PlanSummaryDto {
  images: import('../../media/dto/media-response.dto').MediaImageDto[];
  details: PlanDetailItemDto[];
  /** `authored`, `generated`, or `outing` (see {@link PlanKind}). */
  kind: PlanKind;
  visibility: PlanVisibility;
  /** Whether the caller owns this plan, result, or outing. */
  ownedByViewer: boolean;
}
