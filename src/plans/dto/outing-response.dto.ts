import type { PlanKind } from '../entities/plan.entity';
import type { PlanCostSummaryDto } from './owner-plan-response.dto';
import type { FeedbackState, PlanFeedbackDto } from './plan-feedback.dto';
import type { PlanDetailItemDto } from './plan-response.dto';

/** `to_do` until its holder marks it done, then `completed` (CU22, CU23). */
export type OutingStatus = 'to_do' | 'completed';

/**
 * The plan an outing was copied from. `available` says whether the holder can
 * still open it: the author may have made it private or cancelled it since,
 * which never changes the outing itself.
 */
export interface OutingSourceDto {
  id: number;
  kind: PlanKind;
  title: string;
  available: boolean;
}

/** One entry of "Mis salidas" (`GET /users/me/outings`). */
export interface OutingSummaryDto extends PlanCostSummaryDto {
  id: number;
  title: string;
  description: string | null;
  activityCount: number;
  activityNames: string[];
  status: OutingStatus;
  /** When its holder marked it done, or `null` while it is still to do. */
  completedAt: Date | null;
  /** Where the outing sits in the CU23 feedback lifecycle. */
  feedbackState: FeedbackState;
  /** The recorded experience feedback, or `null` while none exists. */
  feedback: PlanFeedbackDto | null;
  source: OutingSourceDto | null;
  createdAt: Date;
}

/** `GET /users/me/outings/:id`: the frozen itinerary with its places. */
export interface OutingDetailDto extends OutingSummaryDto {
  travelDistanceMeters: number | null;
  travelDurationSeconds: number | null;
  details: PlanDetailItemDto[];
}

/** `POST /users/me/outings` and `POST /users/me/outings/:id/repeat`. */
export interface OutingCreationDto {
  /** `false` when an outing to do already existed and was returned as is. */
  created: boolean;
  outing: OutingDetailDto;
}
