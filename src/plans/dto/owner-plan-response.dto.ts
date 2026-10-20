import type { PlanPriceSummaryDto, PriceDto } from '../../common/pricing/price';
import type { PlanVisibility } from '../entities/plan.entity';
import type { FeedbackState, PlanFeedbackDto } from './plan-feedback.dto';

export interface PlanCostSummaryDto extends PlanPriceSummaryDto {
  peopleCount: number;
  /** Lower-bound per person; `null` when no activity is priced. */
  estimatedCostPerPerson: number | null;
  estimatedTotalDuration: number;
}

export interface OwnPlanSummaryDto extends PlanCostSummaryDto {
  id: number;
  title: string;
  description: string | null;
  activityCount: number;
  status: { key: string; name: string };
  /** `private` until its author publishes it (#98). */
  visibility: PlanVisibility;
  /**
   * An administrator took it down after a report (#156): it stays private
   * and cannot be published again.
   */
  removedByModeration: boolean;
  completedAt: Date | null;
  feedbackState: FeedbackState;
  feedback: PlanFeedbackDto | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnPlanDetailItemDto {
  perPersonCost?: number | null;
  id: number;
  order: number;
  estimatedCost: number | null;
  price: PriceDto;
  estimatedDuration: number;
  activity: {
    id: number;
    name: string;
    description: string;
    estimatedCost: number | null;
    price: PriceDto;
    estimatedDuration: number;
    type: string | null;
  };
}

export interface OwnPlanDetailDto extends OwnPlanSummaryDto {
  details: OwnPlanDetailItemDto[];
}
