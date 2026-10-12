import {
  ActivityLocationDto,
  CategorySummaryDto,
} from '../../activities/dto/activity-response.dto';
import type { PlanKind, PlanVisibility } from '../entities/plan.entity';
import type { ViewerPlanState } from '../plan-selectability';
import type { ImageSource } from '../../media/image-source';

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
   * Representative image for the plan: an uploaded cover or activity image,
   * else the Google Places photo of its first linked place (#102), else
   * `null`.
   */
  imageUrl: string | null;
  /** `google_maps` obliges the client to attribute the photo (#102). */
  imageSource: ImageSource | null;
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
  images: import('../../media/dto/media-response.dto').MediaImageDto[];
  details: PlanDetailItemDto[];
  /** `authored`, `generated`, or `outing` (see {@link PlanKind}). */
  kind: PlanKind;
  visibility: PlanVisibility;
  /** Whether the caller owns this plan, result, or outing. */
  ownedByViewer: boolean;
}
