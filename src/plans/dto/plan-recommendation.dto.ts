import { PaginationMetadata } from '../../common/pagination/paginated-response';
import { PlanSummaryDto } from './plan-response.dto';

/**
 * Why a plan was recommended — the dominant signal that ranked it (CU20/US19).
 * The frontend maps this to honest, non-AI copy on each card.
 *
 * - `history`           — matches categories from the user's completed plans
 * - `preferences`       — matches the user's saved category preferences
 * - `near_you`          — ranked up mainly by proximity to the caller's location
 * - `popular`           — no personal signal; ranked by average activity rating
 * - `within_budget`     — expected real cost fits how the user usually spends (CU21)
 * - `well_rated_by_you` — categories the user rated highly after doing them (CU21)
 */
export type PlanRecommendationReason =
  | 'history'
  | 'preferences'
  | 'near_you'
  | 'popular'
  | 'within_budget'
  | 'well_rated_by_you';

export interface PlanRecommendationDto {
  reason: PlanRecommendationReason;
  plan: PlanSummaryDto;
  /**
   * Contract compatibility only. CU20 recommends other users' plans, so this
   * is always `false`; selecting a plan is CU22 and acts on the user's own
   * generated alternatives.
   */
  canSelect: boolean;
}

export interface RecommendationMetaDto {
  /** `true` when history and/or preferences shaped the ranking. */
  personalized: boolean;
  /** `true` when the caller's coordinates were used for distance ranking. */
  locationUsed: boolean;
  /**
   * `true` when the user's post-experience feedback (CU23) actually moved the
   * ranking — the client shows one honest line about it and nothing otherwise
   * (CU21). Never `true` without feedback.
   */
  adjustedFromFeedback: boolean;
}

export interface PlanRecommendationsResponseDto {
  data: PlanRecommendationDto[];
  pagination: PaginationMetadata;
  meta: RecommendationMetaDto;
}
