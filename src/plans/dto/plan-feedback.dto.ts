import type {
  Feedback,
  FeedbackTag,
} from '../../recommendation/entities/feedback.entity';

/**
 * Where a plan sits in the CU23 feedback lifecycle, derived server-side so the
 * client never computes time windows:
 *
 *  - `not_available` → the plan is not `completed`, or it completed less than
 *    24 h ago and the reminder has not been sent yet.
 *  - `available`     → the plan is `completed` and the feedback window is open
 *    (reminder sent, or 24 h elapsed since completion) and no feedback exists.
 *  - `submitted`     → feedback was already recorded for this plan.
 *
 * There is no `expired` state: US18 defines no closing window, so once a plan
 * is `available` it stays open until feedback is submitted.
 */
export type FeedbackState = 'not_available' | 'available' | 'submitted';

/**
 * A plan's recorded experience feedback (CU23), as read back in the owner's
 * plan list/detail and in the public plan detail when the viewer owns it.
 * Never exposed to anyone other than the plan owner.
 */
export interface PlanFeedbackDto {
  rating: number;
  tags: FeedbackTag[];
  comment: string | null;
  actualCost: number | null;
  actualDuration: number | null;
  createdAt: Date;
}

export function toPlanFeedbackDto(feedback: Feedback): PlanFeedbackDto {
  return {
    rating: feedback.rating,
    tags: feedback.tags ?? [],
    comment: feedback.comment,
    actualCost: feedback.actualCost,
    actualDuration: feedback.actualDuration,
    createdAt: feedback.createdAt,
  };
}
